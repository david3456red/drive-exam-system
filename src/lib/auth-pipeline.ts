/**
 * 登录管道(loginPipeline) — 凭据校验 + 异地登录冻结 + LoginLog 写入。
 *
 * 本模块对应任务 4.4,实现 design.md §Auth & RBAC 详细设计 中的「登录管道」流程。
 *
 * 调用方:登录 Server Action 把客户端表单提交的 `{ username, password, deviceId }`
 * 与请求侧解析出的 `{ ip, userAgent }` 一并传入。返回的 `AuthorizedUser`
 * 会写入签名 Cookie 会话;返回 `null` 时 UI 统一显示「用户名或密码错误」(Requirement 5.5)。
 *
 * 决策顺序(任意一步拒绝都写一条 LoginLog,失败原因 ∈ LoginReason 枚举):
 *
 *   1. deviceId 缺失/空串 → DEVICE_FINGERPRINT_MISSING(Requirement 6.3 / 6.4)
 *   2. 用户名查不到 user → USER_NOT_FOUND(userId 字段写 null)
 *   3. user.status === 'DISABLED' → DISABLED(Requirement 4.2)
 *   4. user.status === 'FROZEN'   → FROZEN_BY_REMOTE(Requirement 4.2;此处只是后续登录被拒,
 *                                                     冻结由前次「异地登录」步骤设置)
 *   5. bcrypt.compare 失败 → WRONG_PASSWORD
 *   6. role.strictLogin && 已有基线(lastLoginIp & lastLoginDeviceId 都非空)
 *      && (本次 ip ≠ 基线 ip 或 本次 deviceId ≠ 基线 deviceId)
 *      → user.status = FROZEN + LoginLog FROZEN_BY_REMOTE(Requirement 7.1)
 *   7. 通过:更新 lastLoginIp / lastLoginDeviceId,写 OK 日志,返回 user
 *
 * 「首次登录」语义:
 *   - 用户初次创建后或被解冻后(Requirement 7.4 要求解冻时清空 lastLoginIp / lastLoginDeviceId),
 *     基线是 null。本步骤把「至少一侧为 null」视作「无基线,直接建立」,而不是「不匹配 → 冻结」,
 *     否则严格学员永远无法完成首次登录。
 *
 * permissionCodes 加载:
 *   - 通过 Role → RolePermission → Permission 一次性查询,取 `permission.code` 列表。
 *   - super_admin 在 `hasPermission` 内短路为 true(Requirement 2.1),token 中携带的 codes
 *     仅作展示一致性使用;此处不做哨兵特化,直接返回 DB 中的权限项,与 seed 保持一致。
 *
 * 关联需求:4.1, 4.2, 5.2, 5.5, 6.3, 6.4, 7.1, 7.2, 7.3, 8.1, 8.2。
 */

import * as bcrypt from 'bcryptjs';

import { prisma } from '@/lib/db';
import { LOGIN_REASONS, USER_STATUSES, type LoginReason } from '@/lib/enums';

// =============================================================================
// 公开类型
// =============================================================================

export type LoginInput = {
  username: string;
  password: string;
  /** 由 FingerprintJS 在浏览器端计算得到;空串/missing 立即拒绝(Requirement 6.3)。 */
  deviceId: string;
  ip: string;
  userAgent: string | null;
};

/**
 * 登录成功后写入签名 Cookie 会话的用户对象。
 *
 * 字段会被原样写入会话 token,不再二次查 DB
 * (Requirement 3.3 「下次登录才刷新缓存」)。
 */
export type AuthorizedUser = {
  id: string;
  username: string;
  name: string | null;
  roleCode: string;
  permissionCodes: string[];
};

// =============================================================================
// 内部:LoginLog 写入(永远不抛,日志失败不能影响登录主流程)
// =============================================================================

type LogContext = {
  username: string;
  ip: string;
  deviceId: string | null;
  userAgent: string | null;
  userId: string | null;
};

async function writeLoginLog(
  ctx: LogContext,
  reason: LoginReason,
  success: boolean,
): Promise<void> {
  // 编译期断言:reason 必须在枚举内(Requirement 8.2)
  if (!LOGIN_REASONS.includes(reason)) {
    // 不应到达;一旦到达说明本模块自身有 bug,落入运行期错误日志而不是丢弃。
    console.error(`[auth-pipeline] invalid LoginReason: ${reason}`);
    return;
  }

  try {
    await prisma.loginLog.create({
      data: {
        userId: ctx.userId,
        username: ctx.username,
        ip: ctx.ip,
        deviceId: ctx.deviceId,
        userAgent: ctx.userAgent,
        success,
        reason,
      },
    });
  } catch (err) {
    // 写日志失败不能阻断登录决策,仅打印告警;调用方仍按主流程返回 user 或 null。
    console.error('[auth-pipeline] failed to write LoginLog:', err);
  }
}

// =============================================================================
// 主流程
// =============================================================================

/**
 * 执行一次登录尝试。无论成功失败,都写一条 LoginLog。
 *
 * @returns 成功时返回 `AuthorizedUser`,任意失败原因都返回 `null`。
 */
export async function loginPipeline(
  input: LoginInput,
): Promise<AuthorizedUser | null> {
  const username = (input.username ?? '').trim();
  const password = input.password ?? '';
  const deviceId = (input.deviceId ?? '').trim();
  const ip = (input.ip ?? '').trim() || '0.0.0.0';
  const userAgent = input.userAgent ?? null;

  // 用于 LoginLog 的 deviceId:空串/missing 写 null,便于审计区分缺失指纹
  const logDeviceId = deviceId === '' ? null : deviceId;
  const baseCtx: Omit<LogContext, 'userId'> = {
    username,
    ip,
    deviceId: logDeviceId,
    userAgent,
  };

  // ---- Step 1: deviceId 缺失立即拒绝(不查 user)---------------------------
  if (deviceId === '') {
    await writeLoginLog({ ...baseCtx, userId: null }, 'DEVICE_FINGERPRINT_MISSING', false);
    return null;
  }

  // ---- Step 2: 查用户 -----------------------------------------------------
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  });

  if (!user) {
    await writeLoginLog({ ...baseCtx, userId: null }, 'USER_NOT_FOUND', false);
    return null;
  }

  const userCtx: LogContext = { ...baseCtx, userId: user.id };

  // 防御性断言:status 必须在枚举内。schema 中 status 是 String,运行期由本断言守护。
  // 不在枚举内时按 DISABLED 处理(最严格),避免「未知状态」绕过判定。
  const status = USER_STATUSES.includes(user.status as (typeof USER_STATUSES)[number])
    ? (user.status as (typeof USER_STATUSES)[number])
    : 'DISABLED';

  // ---- Step 3: 状态机检查 -------------------------------------------------
  if (status === 'DISABLED') {
    await writeLoginLog(userCtx, 'DISABLED', false);
    return null;
  }
  if (status === 'FROZEN') {
    await writeLoginLog(userCtx, 'FROZEN_BY_REMOTE', false);
    return null;
  }

  // ---- Step 4: 密码比对 ---------------------------------------------------
  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    await writeLoginLog(userCtx, 'WRONG_PASSWORD', false);
    return null;
  }

  // ---- Step 5: 严格学员异地登录检查 ---------------------------------------
  // 仅当角色 strictLogin=true 且基线两端都已建立(都非空)时才比对;
  // 「至少一侧为 null」视作首次登录或解冻后首次登录,直接建立基线(Requirement 7.4)。
  if (user.role.strictLogin) {
    const hasBaseline =
      !!user.lastLoginIp &&
      user.lastLoginIp !== '' &&
      !!user.lastLoginDeviceId &&
      user.lastLoginDeviceId !== '';

    if (
      hasBaseline &&
      (user.lastLoginIp !== ip || user.lastLoginDeviceId !== deviceId)
    ) {
      // 同事务:置 FROZEN + 写 FROZEN_BY_REMOTE 日志
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { status: 'FROZEN' },
        });
      });
      await writeLoginLog(userCtx, 'FROZEN_BY_REMOTE', false);
      return null;
    }
  }

  // ---- Step 6: 成功登录 ---------------------------------------------------
  // 更新基线 + 写 OK 日志 + 加载 permissionCodes
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginIp: ip,
      lastLoginDeviceId: deviceId,
    },
  });

  // 一次性查 permissionCodes(Requirement 3.3)
  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId: user.roleId },
    include: { permission: { select: { code: true } } },
  });
  const permissionCodes = rolePerms.map((rp) => rp.permission.code);

  await writeLoginLog(userCtx, 'OK', true);

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    roleCode: user.role.code,
    permissionCodes,
  };
}
