/**
 * Prisma 种子脚本 — 初始化 RBAC、内置题库与初始管理员。
 *
 * 行为:全部使用 `upsert`,因此本脚本是**幂等**的,可被以下场景安全反复执行:
 *   - `pnpm db:seed`(本地开发)
 *   - Docker 入口 `docker/entrypoint.sh` 启动时(任务 14.1)
 *   - `pnpm db:reset` 之后由 Prisma 自动调用(`prisma.seed` 配置)
 *
 * 依赖:Task 1.3 已生成的 Prisma schema 与 init 迁移。
 *
 * 30 个权限码与 Task 4.1 (`src/lib/permissions.ts`) 中的 `ALL_PERMISSION_CODES`
 * 必须**保持一致**。两处任务并行实施时,以本文件 `PERMISSIONS` 数组为参考列表;
 * 4.1 落盘后建议改为从 `src/lib/permissions.ts` 导入以避免漂移。
 *
 * 关联需求:
 *   - 1.1 / 1.2 / 1.3 / 1.4 / 1.5 — RBAC 5 角色 + 30 权限点 + 内置标记
 *   - 5.3 / 5.4 — 初始管理员账号(默认 admin / Admin@123,不强制首次改密)
 *   - 10.2 — 内置题库 subject_1 / subject_4
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// =============================================================================
// 1. 30 个权限点(7 个 group)
// =============================================================================
//
// 维护规则:任何修改必须同步至 src/lib/permissions.ts 的 ALL_PERMISSION_CODES。
// 顺序固定,种子写入即按此顺序;不要新增/删除/重排,以免破坏与 4.1 的契约。

type PermissionSeed = {
  code: string;
  group: string;
  name: string;
};

const PERMISSIONS: readonly PermissionSeed[] = [
  // ---- 用户管理 (5) ----
  { code: 'user:read',           group: '用户管理', name: '查看用户' },
  { code: 'user:write',          group: '用户管理', name: '新建/编辑用户' },
  { code: 'user:delete',         group: '用户管理', name: '删除用户' },
  { code: 'user:unfreeze',       group: '用户管理', name: '解冻用户' },
  { code: 'user:reset-password', group: '用户管理', name: '重置用户密码' },

  // ---- 角色权限 (4) ----
  { code: 'role:read',             group: '角色权限', name: '查看角色' },
  { code: 'role:edit-permissions', group: '角色权限', name: '编辑角色权限' },
  { code: 'role:create',           group: '角色权限', name: '新建角色' },
  { code: 'role:delete',           group: '角色权限', name: '删除角色' },

  // ---- 题库管理 (3) ----
  { code: 'bank:read',   group: '题库管理', name: '查看题库' },
  { code: 'bank:write',  group: '题库管理', name: '新建/编辑题库' },
  { code: 'bank:delete', group: '题库管理', name: '删除题库' },

  // ---- 题目管理 (7) ----
  { code: 'question:read',     group: '题目管理', name: '查看题目' },
  { code: 'question:write',    group: '题目管理', name: '新建/编辑题目' },
  { code: 'question:delete',   group: '题目管理', name: '删除题目' },
  { code: 'question:import',   group: '题目管理', name: '批量导入题目' },
  { code: 'category:read',     group: '题目管理', name: '查看分类' },
  { code: 'category:write',    group: '题目管理', name: '新建/编辑分类' },
  { code: 'category:delete',   group: '题目管理', name: '删除分类' },

  // ---- 答题 (4) ----
  { code: 'exam:practice', group: '答题', name: '练习答题' },
  { code: 'exam:mock',     group: '答题', name: '模拟考试' },
  { code: 'wrong:read',    group: '答题', name: '查看错题' },
  { code: 'wrong:manage',  group: '答题', name: '管理错题(掌握/标记)' },

  // ---- 统计 (3) ----
  { code: 'stats:self',   group: '统计', name: '查看自己的统计' },
  { code: 'stats:all',    group: '统计', name: '查看所有学员统计' },
  { code: 'stats:export', group: '统计', name: '导出统计数据' },

  // ---- 系统 (4) ----
  { code: 'log:read',         group: '系统', name: '查看登录日志' },
  { code: 'log:export',       group: '系统', name: '导出登录日志' },
  { code: 'system:settings',  group: '系统', name: '系统设置' },
  { code: 'system:backup',    group: '系统', name: '系统备份' },
] as const;

const ALL_CODES = PERMISSIONS.map((p) => p.code);


// 运行期断言(防止维护漂移)
if (PERMISSIONS.length !== 30) {
  throw new Error(
    `[seed] PERMISSIONS 必须恰好 30 项,当前 ${PERMISSIONS.length}。请同步更新 src/lib/permissions.ts。`
  );
}
if (new Set(ALL_CODES).size !== ALL_CODES.length) {
  throw new Error('[seed] PERMISSIONS 中存在重复 code');
}

// =============================================================================
// 2. 5 个角色与角色-权限映射
// =============================================================================
//
// super_admin 在 hasPermission 中走代码常量短路(Requirement 2.1),理论上无需
// DB 关联;但仍写入全部 30 项,使 /admin/roles 页面展示一致(design.md §种子数据规格 第 3 条)。
//
// admin 拥有除 role:* (除 role:read) 之外的全部权限。仅 super_admin 能编辑角色权限。
//
// teacher 拥有读类权限 + 自己的练习/模考 + 全员统计 + 日志只读。
//
// student_strict / student_normal 共享同一权限集(都是学员侧权限);
// 二者唯一区别是 strictLogin(异地登录冻结开关)。

type RoleSeed = {
  code: string;
  name: string;
  strictLogin: boolean;
  /** 该角色应分配的权限码集合;super_admin 用 '*' 哨兵表示全部 */
  permissions: readonly string[] | '*';
};

const STUDENT_PERMISSIONS = [
  'exam:practice',
  'exam:mock',
  'stats:self',
  'wrong:read',
  'wrong:manage',
  'bank:read',
  'question:read',
  'category:read',
] as const;

const ADMIN_PERMISSIONS = ALL_CODES.filter(
  (c) =>
    c !== 'role:edit-permissions' &&
    c !== 'role:create' &&
    c !== 'role:delete'
);

const TEACHER_PERMISSIONS = [
  'stats:self',
  'stats:all',
  'exam:practice',
  'exam:mock',
  'wrong:read',
  'bank:read',
  'question:read',
  'category:read',
  'log:read',
] as const;

const ROLES: readonly RoleSeed[] = [
  {
    code: 'super_admin',
    name: '超级管理员',
    strictLogin: false,
    permissions: '*',
  },
  {
    code: 'admin',
    name: '管理员',
    strictLogin: false,
    permissions: ADMIN_PERMISSIONS,
  },
  {
    code: 'teacher',
    name: '教练',
    strictLogin: false,
    permissions: TEACHER_PERMISSIONS,
  },
  {
    code: 'student_strict',
    name: '严格学员',
    strictLogin: true, // 异地登录自动冻结(Requirement 1.5 / 7.1)
    permissions: STUDENT_PERMISSIONS,
  },
  {
    code: 'student_normal',
    name: '普通学员',
    strictLogin: false,
    permissions: STUDENT_PERMISSIONS,
  },
] as const;

// =============================================================================
// 3. 内置题库
// =============================================================================

type BankSeed = {
  code: string;
  name: string;
  vehicleCode: string;
  subjectCode: string;
  displayOrder: number;
  mockQuestionCount: number;
  mockDurationMs: number;
  mockPassScore: number;
};

const BUILTIN_BANKS: readonly BankSeed[] = [
  {
    code: 'C1_K1',
    name: '小车科目一',
    vehicleCode: 'C1',
    subjectCode: 'K1',
    displayOrder: 10,
    mockQuestionCount: 100,
    mockDurationMs: 45 * 60 * 1000,
    mockPassScore: 90,
  },
  {
    code: 'C1_K4',
    name: '小车科目四',
    vehicleCode: 'C1',
    subjectCode: 'K4',
    displayOrder: 20,
    mockQuestionCount: 50,
    mockDurationMs: 30 * 60 * 1000,
    mockPassScore: 90,
  },
] as const;

const SAMPLE_CATEGORIES = [
  '道路交通安全法律法规',
  '交通信号',
  '安全文明驾驶',
  '恶劣天气与应急处置',
] as const;

const SAMPLE_COUNTS: Record<string, number> = {
  C1_K1: 100,
  C1_K4: 50,
};

// =============================================================================
// 4. 主流程
// =============================================================================

async function main() {
  console.log('[seed] 开始执行种子脚本...');

  // ---------------------------------------------------------------------------
  // 4.1 Permission upsert
  // ---------------------------------------------------------------------------
  console.log(`[seed] upsert ${PERMISSIONS.length} 个权限点...`);
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { group: p.group, name: p.name },
      create: { code: p.code, group: p.group, name: p.name },
    });
  }

  // 取回 permission code -> id 映射,后续构造 RolePermission 关联
  const permRows = await prisma.permission.findMany({
    select: { id: true, code: true },
  });
  const permIdByCode = new Map(permRows.map((r) => [r.code, r.id]));

  // ---------------------------------------------------------------------------
  // 4.2 Role upsert
  // ---------------------------------------------------------------------------
  console.log(`[seed] upsert ${ROLES.length} 个角色...`);
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: {
        name: r.name,
        strictLogin: r.strictLogin,
        isSystem: true,
      },
      create: {
        code: r.code,
        name: r.name,
        strictLogin: r.strictLogin,
        isSystem: true, // Requirement 1.4
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 4.3 RolePermission 关联(全量重建,保证幂等且与种子定义对齐)
  // ---------------------------------------------------------------------------
  console.log('[seed] 重建 RolePermission 关联...');
  for (const r of ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: r.code } });

    const codesToAssign: string[] =
      r.permissions === '*' ? [...ALL_CODES] : [...r.permissions];

    // 校验所有权限码都存在(防止角色定义里写了拼写错误的码)
    for (const code of codesToAssign) {
      if (!permIdByCode.has(code)) {
        throw new Error(
          `[seed] 角色 ${r.code} 引用了未定义的权限码: ${code}`
        );
      }
    }

    // 先清空当前角色的关联,再按本次定义重建。
    // 这种"先清后建"的策略让本脚本具备**修复漂移**的能力:
    // 如果有人手动在 DB 改过 RolePermission,执行 seed 会被强制对齐。
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (codesToAssign.length > 0) {
      await prisma.rolePermission.createMany({
        data: codesToAssign.map((code) => ({
          roleId: role.id,
          permissionId: permIdByCode.get(code)!,
        })),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4.4 内置题库
  // ---------------------------------------------------------------------------
  console.log(`[seed] upsert ${BUILTIN_BANKS.length} 个内置题库...`);
  for (const b of BUILTIN_BANKS) {
    await prisma.questionBank.upsert({
      where: { code: b.code },
      update: {
        name: b.name,
        isBuiltin: true,
        vehicleCode: b.vehicleCode,
        subjectCode: b.subjectCode,
        displayOrder: b.displayOrder,
        mockQuestionCount: b.mockQuestionCount,
        mockDurationMs: b.mockDurationMs,
        mockPassScore: b.mockPassScore,
      }, // Requirement 10.2
      create: {
        code: b.code,
        name: b.name,
        isBuiltin: true,
        vehicleCode: b.vehicleCode,
        subjectCode: b.subjectCode,
        displayOrder: b.displayOrder,
        mockQuestionCount: b.mockQuestionCount,
        mockDurationMs: b.mockDurationMs,
        mockPassScore: b.mockPassScore,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 4.5 初始管理员
  // ---------------------------------------------------------------------------
  const adminUsername = process.env.INITIAL_ADMIN_USERNAME?.trim() || 'admin';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin@123';

  console.log(`[seed] upsert 初始管理员账号 username=${adminUsername} ...`);

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'super_admin' },
  });
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // 注意:upsert 的 update 分支**不重置密码**——这避免了管理员改完密码后,
  // 下次 seed 把密码重置回 .env 的默认值。仅在首次创建时写入密码 hash。
  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      // 仅同步元数据;密码与状态由管理员自行维护
      roleId: adminRole.id,
    },
    create: {
      username: adminUsername,
      passwordHash,
      name: '系统管理员',
      roleId: adminRole.id,
      status: 'ACTIVE',
    },
  });

  if (process.env.SEED_DEMO_USERS !== 'false') {
    await seedDemoUser('student', '演示学员', 'student_normal', 'Student@123');
    await seedDemoUser('teacher', '演示教练', 'teacher', 'Teacher@123');
  }

  await seedSampleQuestions();

  console.log('[seed] 完成。');
}

async function seedDemoUser(
  username: string,
  name: string,
  roleCode: string,
  password: string,
) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  await prisma.user.upsert({
    where: { username },
    update: { roleId: role.id, name },
    create: {
      username,
      name,
      roleId: role.id,
      passwordHash: await bcrypt.hash(password, 10),
      status: 'ACTIVE',
    },
  });
}

async function seedSampleQuestions() {
  console.log('[seed] 准备示例分类与题目...');
  const categories = await Promise.all(
    SAMPLE_CATEGORIES.map(async (name) => {
      const existing = await prisma.category.findFirst({
        where: { name, parentId: null },
      });
      if (existing) return existing;
      return prisma.category.create({ data: { name } });
    }),
  );

  for (const bankSeed of BUILTIN_BANKS) {
    const bank = await prisma.questionBank.findUniqueOrThrow({
      where: { code: bankSeed.code },
    });
    const existingCount = await prisma.question.count({ where: { bankId: bank.id } });
    if (existingCount > 0) {
      console.log(`[seed] ${bank.code} 已有 ${existingCount} 题,跳过示例题生成。`);
      continue;
    }

    const count = SAMPLE_COUNTS[bank.code] ?? 50;
    console.log(`[seed] 为 ${bank.code} 生成 ${count} 道示例题...`);
    for (let i = 1; i <= count; i++) {
      const category = categories[(i - 1) % categories.length]!;
      const type = sampleType(i);
      const sample = sampleQuestion(bank.name, i, type);
      await prisma.question.create({
        data: {
          bankId: bank.id,
          type,
          content: sample.content,
          imageUrl: null,
          options: JSON.stringify(sample.options),
          answer: sample.answer,
          explanation: sample.explanation,
          tags: JSON.stringify([bank.code, category.name]),
          categories: {
            create: { categoryId: category.id },
          },
        },
      });
    }
  }
}

function sampleType(index: number): 'SINGLE' | 'MULTI' | 'JUDGE' {
  if (index % 5 === 0) return 'MULTI';
  if (index % 3 === 0) return 'JUDGE';
  return 'SINGLE';
}

function sampleQuestion(
  bankName: string,
  index: number,
  type: 'SINGLE' | 'MULTI' | 'JUDGE',
) {
  if (type === 'JUDGE') {
    const answer = index % 2 === 0 ? 'T' : 'F';
    return {
      content: `${bankName} 示例判断题 ${index}: 驾驶人应当根据道路、天气和交通状况安全驾驶。`,
      options: [
        { key: 'T', text: '正确' },
        { key: 'F', text: '错误' },
      ],
      answer,
      explanation: answer === 'T' ? '安全驾驶要求随路况调整车速和操作。' : '请以题库正式解析为准。',
    };
  }

  if (type === 'MULTI') {
    return {
      content: `${bankName} 示例多选题 ${index}: 遇到复杂交通环境时，哪些做法有助于降低风险？`,
      options: [
        { key: 'A', text: '提前观察交通信号和标志标线' },
        { key: 'B', text: '临近路口突然加速通过' },
        { key: 'C', text: '与前车保持安全距离' },
        { key: 'D', text: '随意变更车道' },
      ],
      answer: 'AC',
      explanation: '提前观察和保持安全距离是降低风险的关键做法。',
    };
  }

  return {
    content: `${bankName} 示例单选题 ${index}: 行车中发现前方有行人通过人行横道时，应当怎样操作？`,
    options: [
      { key: 'A', text: '减速或停车让行' },
      { key: 'B', text: '鸣喇叭催促行人' },
      { key: 'C', text: '从行人前方加速绕过' },
      { key: 'D', text: '持续原速通过' },
    ],
    answer: 'A',
    explanation:
      '机动车行经人行横道应当减速，遇行人正在通过应停车让行。',
  };
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] 执行失败:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
