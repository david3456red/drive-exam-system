import Link from 'next/link';

import { prisma } from '@/lib/db';
import { hasPermission, type PermissionCode } from '@/lib/permissions';
import { requireUser } from '@/lib/server-session';

const MODULES: Array<{
  href: string;
  title: string;
  description: string;
  permission: PermissionCode;
}> = [
  { href: '/admin/banks', title: '题库管理', description: '维护科目题库与内置题库状态。', permission: 'bank:read' },
  { href: '/admin/categories', title: '分类管理', description: '维护章节分类树，供章节练习筛选。', permission: 'category:read' },
  { href: '/admin/questions', title: '题目管理', description: '查询题目、录入新题和删除废弃题目。', permission: 'question:read' },
  { href: '/admin/student-stats', title: '学员统计', description: '查看学员练习次数、正确率和历史记录。', permission: 'stats:all' },
  { href: '/admin/login-logs', title: '登录日志', description: '审计登录结果、设备指纹和异地冻结。', permission: 'log:read' },
  { href: '/admin/roles', title: '角色权限', description: '查看角色权限，超级管理员可调整权限点。', permission: 'role:read' },
  { href: '/admin/users', title: '用户管理', description: '创建用户、冻结/解冻账号和重置密码。', permission: 'user:read' },
];

export default async function AdminHomePage() {
  const user = requireUser();
  const [bankCount, questionCount, studentCount, logCount] = await Promise.all([
    prisma.questionBank.count(),
    prisma.question.count(),
    prisma.user.count({ where: { role: { code: { in: ['student_strict', 'student_normal'] } } } }),
    prisma.loginLog.count(),
  ]);
  const visible = MODULES.filter((item) => hasPermission({ user }, item.permission));

  return (
    <main className="page stack">
      <div className="page-title">
        <span className="badge good">后台工作台</span>
        <h1>运营总览</h1>
        <p>题库、用户、练习统计与安全日志集中管理。所有页面都按角色权限过滤。</p>
      </div>

      <section className="grid" aria-label="关键指标">
        <Metric title="题库" value={bankCount} />
        <Metric title="题目" value={questionCount} />
        <Metric title="学员" value={studentCount} />
        <Metric title="登录日志" value={logCount} />
      </section>

      <section className="grid" aria-label="后台模块">
        {visible.map((item) => (
          <Link className="card stack" href={item.href} key={item.href}>
            <h2>{item.title}</h2>
            <p className="muted">{item.description}</p>
            <span className="button primary">进入</span>
          </Link>
        ))}
      </section>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="card">
      <p className="muted">{title}</p>
      <strong style={{ fontSize: '2rem' }}>{value}</strong>
    </div>
  );
}
