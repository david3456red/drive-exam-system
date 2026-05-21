/**
 * Seed script: roles, permissions, question banks, super-admin account.
 *
 * Run with: `npm run db:seed`
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---- Permissions catalog ----------------------------------------------------
const PERMISSIONS: { code: string; name: string; group: string }[] = [
  // 用户管理
  { code: 'user:read', name: '查看用户', group: '用户管理' },
  { code: 'user:create', name: '创建用户', group: '用户管理' },
  { code: 'user:update', name: '修改用户', group: '用户管理' },
  { code: 'user:delete', name: '删除用户', group: '用户管理' },
  { code: 'user:unfreeze', name: '解冻用户', group: '用户管理' },
  { code: 'user:reset_password', name: '重置密码', group: '用户管理' },
  // 角色权限
  { code: 'role:read', name: '查看角色', group: '角色权限' },
  { code: 'role:create', name: '创建角色', group: '角色权限' },
  { code: 'role:update', name: '修改角色', group: '角色权限' },
  { code: 'role:delete', name: '删除角色', group: '角色权限' },
  // 题库
  { code: 'bank:read', name: '查看题库', group: '题库管理' },
  { code: 'bank:create', name: '创建题库', group: '题库管理' },
  { code: 'bank:update', name: '修改题库', group: '题库管理' },
  { code: 'bank:delete', name: '删除题库', group: '题库管理' },
  // 分类
  { code: 'category:read', name: '查看分类', group: '题库管理' },
  { code: 'category:create', name: '创建分类', group: '题库管理' },
  { code: 'category:update', name: '修改分类', group: '题库管理' },
  { code: 'category:delete', name: '删除分类', group: '题库管理' },
  // 题目
  { code: 'question:read', name: '查看题目', group: '题目管理' },
  { code: 'question:create', name: '创建题目', group: '题目管理' },
  { code: 'question:update', name: '修改题目', group: '题目管理' },
  { code: 'question:delete', name: '删除题目', group: '题目管理' },
  { code: 'question:import', name: '导入题目', group: '题目管理' },
  { code: 'question:scrape', name: '抓取题目', group: '题目管理' },
  // 答题
  { code: 'exam:practice', name: '练习答题', group: '答题' },
  { code: 'exam:mock', name: '模拟考试', group: '答题' },
  // 统计
  { code: 'stats:self', name: '查看自己成绩', group: '统计' },
  { code: 'stats:all', name: '查看全部成绩', group: '统计' },
  // 系统
  { code: 'system:config', name: '系统配置', group: '系统' },
  { code: 'system:login_log', name: '查看登录日志', group: '系统' },
];

// ---- Role definitions ------------------------------------------------------
const ROLES: {
  name: string;
  displayName: string;
  strictLogin: boolean;
  sortOrder: number;
  permissions: string[] | 'ALL';
}[] = [
  {
    name: 'super_admin',
    displayName: '超级管理员',
    strictLogin: false,
    sortOrder: 10,
    permissions: 'ALL',
  },
  {
    name: 'admin',
    displayName: '管理员',
    strictLogin: false,
    sortOrder: 20,
    permissions: [
      'user:read', 'user:create', 'user:update', 'user:delete',
      'user:unfreeze', 'user:reset_password',
      'role:read',
      'bank:read', 'bank:create', 'bank:update', 'bank:delete',
      'category:read', 'category:create', 'category:update', 'category:delete',
      'question:read', 'question:create', 'question:update', 'question:delete',
      'question:import', 'question:scrape',
      'exam:practice', 'exam:mock',
      'stats:self', 'stats:all',
      'system:login_log',
    ],
  },
  {
    name: 'teacher',
    displayName: '教练',
    strictLogin: false,
    sortOrder: 30,
    permissions: [
      'question:read',
      'exam:practice', 'exam:mock',
      'stats:self', 'stats:all',
    ],
  },
  {
    name: 'student_strict',
    displayName: '严格学员',
    strictLogin: true,
    sortOrder: 40,
    permissions: [
      'question:read',
      'exam:practice', 'exam:mock',
      'stats:self',
    ],
  },
  {
    name: 'student_normal',
    displayName: '普通学员',
    strictLogin: false,
    sortOrder: 50,
    permissions: [
      'question:read',
      'exam:practice', 'exam:mock',
      'stats:self',
    ],
  },
];

// ---- Built-in question banks ----------------------------------------------
const BANKS = [
  { code: 'subject_1', name: '科目一', description: '驾考理论(科目一)题库', sortOrder: 10 },
  { code: 'subject_4', name: '科目四', description: '驾考理论(科目四)题库', sortOrder: 20 },
];

async function main() {
  console.log('🌱 Seeding database...');

  // 1) Permissions
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, name: p.name, groupName: p.group },
      update: { name: p.name, groupName: p.group },
    });
  }
  console.log(`  ✓ ${PERMISSIONS.length} permissions`);

  const allPerms = await prisma.permission.findMany();
  const permByCode = new Map(allPerms.map((p) => [p.code, p]));

  // 2) Roles + role_permission
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      create: {
        name: r.name,
        displayName: r.displayName,
        strictLogin: r.strictLogin,
        isBuiltin: true,
        sortOrder: r.sortOrder,
      },
      update: {
        displayName: r.displayName,
        strictLogin: r.strictLogin,
        isBuiltin: true,
        sortOrder: r.sortOrder,
      },
    });

    const permCodes = r.permissions === 'ALL' ? allPerms.map((p) => p.code) : r.permissions;

    // wipe & recreate role_permission for predictability
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permCodes
        .map((code) => permByCode.get(code))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }
  console.log(`  ✓ ${ROLES.length} roles`);

  // 3) Question banks
  for (const b of BANKS) {
    await prisma.questionBank.upsert({
      where: { code: b.code },
      create: { ...b, isBuiltin: true, isActive: true },
      update: { name: b.name, description: b.description, sortOrder: b.sortOrder },
    });
  }
  console.log(`  ✓ ${BANKS.length} question banks`);

  // 4) Super-admin account
  const superAdmin = await prisma.role.findUnique({ where: { name: 'super_admin' } });
  if (!superAdmin) throw new Error('super_admin role missing');

  const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';
  const password = process.env.INITIAL_ADMIN_PASSWORD || 'Admin@123';

  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        username,
        name: '超级管理员',
        passwordHash,
        roleId: superAdmin.id,
        status: 'ACTIVE',
        mustChangePassword: true,
      },
    });
    console.log(`  ✓ super-admin account created: ${username} / ${password} (must change on first login)`);
  } else {
    console.log(`  • super-admin "${username}" already exists, skipping`);
  }

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
