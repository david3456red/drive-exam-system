/**
 * 权限子系统(Requirement 1.3 / 2.1)
 *
 * - `ALL_PERMISSION_CODES`:30 个权限码常量,按 7 个 group 组织,与 RBAC 种子保持同步:
 *   - 用户管理 (5):user:read / write / delete / unfreeze / reset-password
 *   - 角色权限 (4):role:read / create / edit-permissions / delete
 *   - 题库管理 (3):bank:read / write / delete
 *   - 题目管理 (7):question:read / write / delete / import + category:read / write / delete
 *   - 答题   (4):exam:practice / mock + wrong:read / manage
 *   - 统计   (3):stats:self / all / export
 *   - 系统   (4):log:read / export + system:settings / backup
 *
 * - `hasPermission`:`super_admin` 角色码短路返回 true(Requirement 2.1),
 *   优先级高于 DB 中 RolePermission 关联表的实际记录;其它角色按会话中预签发的
 *   `permissionCodes` 进行 includes 比对(Requirement 3.3 "下次登录刷新缓存")。
 *
 * - `requirePermission`:Server Action / RSC 入口使用,无权时抛 UnauthorizedError,
 *   由顶层 catch 转 302 或返回 `{ ok:false, error:'无权操作' }`。
 *
 * 本模块刻意不绑定具体鉴权库,使用结构化 `SessionLike` 类型;当前实现由
 * `src/lib/server-session.ts` 从签名 Cookie 解析出同形状的 `user` 字段。
 */

// ============================================================================
// 权限码常量
// ============================================================================

export const ALL_PERMISSION_CODES = [
  // ---- 用户管理 ----
  'user:read',
  'user:write',
  'user:delete',
  'user:unfreeze',
  'user:reset-password',

  // ---- 角色权限 ----
  'role:read',
  'role:create',
  'role:edit-permissions',
  'role:delete',

  // ---- 题库管理 ----
  'bank:read',
  'bank:write',
  'bank:delete',

  // ---- 题目管理 ----
  'question:read',
  'question:write',
  'question:delete',
  'question:import',
  'category:read',
  'category:write',
  'category:delete',

  // ---- 答题 ----
  'exam:practice',
  'exam:mock',
  'wrong:read',
  'wrong:manage',

  // ---- 统计 ----
  'stats:self',
  'stats:all',
  'stats:export',

  // ---- 系统 ----
  'log:read',
  'log:export',
  'system:settings',
  'system:backup',
] as const;

export type PermissionCode = (typeof ALL_PERMISSION_CODES)[number];

/**
 * 当前权限判定需要的最小化会话结构契约。
 */
export type SessionLike =
  | {
      user: {
        id: string;
        roleCode: string;
        permissionCodes: readonly string[];
      };
    }
  | null
  | undefined;

// ============================================================================
// 异常类型
// ============================================================================

/**
 * 当 session 缺少所需权限时抛出。
 *
 * Server Action 顶层 catch 应将其转换为 `{ ok:false, error:'无权操作' }`,
 * RSC 入口应转为 302 至各自 home。
 */
export class UnauthorizedError extends Error {
  /** 触发拒绝的权限码,便于日志与调试。 */
  public readonly code: string;

  constructor(code: string) {
    super(`Unauthorized: missing permission '${code}'`);
    this.name = 'UnauthorizedError';
    this.code = code;
    // 维护原型链,使 `instanceof UnauthorizedError` 在跨编译目标下正确工作。
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

// ============================================================================
// 权限判定
// ============================================================================

/**
 * 判断当前 session 是否拥有指定权限码。
 *
 * 决策顺序:
 * 1. session 不存在或缺 user 字段 → false
 * 2. `user.roleCode === 'super_admin'` → true(短路,Requirement 2.1)
 * 3. `user.permissionCodes.includes(code)`
 */
export function hasPermission(
  session: SessionLike,
  code: PermissionCode,
): boolean {
  if (!session?.user) return false;
  if (session.user.roleCode === 'super_admin') return true;
  return session.user.permissionCodes.includes(code);
}

/**
 * 在 Server Action / RSC 入口强制要求 session 拥有指定权限。
 *
 * 不满足时抛 `UnauthorizedError(code)`。
 */
export function requirePermission(
  session: SessionLike,
  code: PermissionCode,
): void {
  if (!hasPermission(session, code)) {
    throw new UnauthorizedError(code);
  }
}
