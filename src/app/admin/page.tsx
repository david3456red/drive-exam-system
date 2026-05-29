import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BarChart3,
  BookMarked,
  ClipboardList,
  FilePlus2,
  FolderTree,
  ShieldCheck,
  UserCog,
  UsersRound,
} from 'lucide-react';

import { prisma } from '@/lib/db';
import { hasPermission, type PermissionCode } from '@/lib/permissions';
import { requireUser } from '@/lib/server-session';

const MODULES: Array<{
  href: string;
  title: string;
  description: string;
  permission: PermissionCode;
  icon: LucideIcon;
}> = [
  { href: '/admin/banks', title: '题库管理', description: '维护科目题库与内置题库状态。', permission: 'bank:read', icon: BookMarked },
  { href: '/admin/categories', title: '分类管理', description: '维护章节分类树，供章节练习筛选。', permission: 'category:read', icon: FolderTree },
  { href: '/admin/questions', title: '题目管理', description: '查询题目、录入新题和删除废弃题目。', permission: 'question:read', icon: ClipboardList },
  { href: '/admin/student-stats', title: '学员统计', description: '查看学员练习次数、正确率和历史记录。', permission: 'stats:all', icon: BarChart3 },
  { href: '/admin/login-logs', title: '登录日志', description: '审计登录结果、设备指纹和异地冻结。', permission: 'log:read', icon: ShieldCheck },
  { href: '/admin/roles', title: '角色权限', description: '查看角色权限，超级管理员可调整权限点。', permission: 'role:read', icon: UserCog },
  { href: '/admin/users', title: '用户管理', description: '创建用户、冻结/解冻账号和重置密码。', permission: 'user:read', icon: UsersRound },
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
    <main className="page admin-dashboard">
      <section className="admin-hero">
        <div className="page-title">
          <span className="badge good">
            <ShieldCheck size={15} aria-hidden="true" />
            后台工作台
          </span>
          <h1>运营总览</h1>
          <p>题库、用户、练习统计与安全日志集中管理。所有页面都按角色权限过滤。</p>
        </div>
        <Link className="button primary" href="/admin/questions/new">
          <FilePlus2 size={17} aria-hidden="true" />
          新建题目
        </Link>
      </section>

      <section className="admin-summary" aria-label="关键指标">
        <Metric icon={BookMarked} title="题库" value={bankCount} />
        <Metric icon={ClipboardList} title="题目" value={questionCount} />
        <Metric icon={UsersRound} title="学员" value={studentCount} />
        <Metric icon={ShieldCheck} title="登录日志" value={logCount} />
      </section>

      <section className="module-grid" aria-label="后台模块">
        {visible.map((item) => {
          const Icon = item.icon;
          return (
            <Link className="module-card" href={item.href} key={item.href}>
              <span className="module-card-head">
                <span className="status-mark">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </span>
              </span>
              <span className="module-card-footer">
                <span>进入模块</span>
                <ArrowRight size={17} aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}

function Metric({ icon: Icon, title, value }: { icon: LucideIcon; title: string; value: number }) {
  return (
    <div className="metric-card">
      <span>
        <Icon size={15} aria-hidden="true" />
        {title}
      </span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}
