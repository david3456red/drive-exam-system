'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  History,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  ScrollText,
  ShieldCheck,
  UserCog,
  UsersRound,
} from 'lucide-react';

import { hasPermission, type PermissionCode } from '@/lib/permissions';
import type { SessionUser } from '@/lib/session';
import { isStaffRole, isStudentRole } from '@/lib/login-flow';

export type ShellNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionCode;
  tone?: 'primary';
};

export type ShellNavContext = {
  isAdminPath: boolean;
};

const STUDENT_NAV: ShellNavItem[] = [
  { href: '/exam', label: '练习', icon: BookOpenCheck, tone: 'primary' },
  { href: '/exam/wrong', label: '错题', icon: ClipboardList },
  { href: '/exam/history', label: '记录', icon: History },
  { href: '/change-password', label: '改密', icon: KeyRound },
];

const OPERATOR_NAV: ShellNavItem[] = [
  { href: '/admin', label: '工作台', icon: LayoutDashboard, tone: 'primary' },
  { href: '/admin/questions', label: '题库', icon: ClipboardList, permission: 'question:read' },
  { href: '/admin/student-stats', label: '统计', icon: BarChart3, permission: 'stats:all' },
  { href: '/admin/login-logs', label: '安全', icon: ShieldCheck, permission: 'log:read' },
  { href: '/admin/users', label: '用户', icon: UsersRound, permission: 'user:read' },
  { href: '/admin/roles', label: '角色', icon: UserCog, permission: 'role:read' },
  { href: '/change-password', label: '改密', icon: KeyRound },
];

export function buildShellNav(
  user: SessionUser | null,
  context: ShellNavContext = { isAdminPath: false },
): ShellNavItem[] {
  if (!user) {
    return context.isAdminPath
      ? [{ href: '/admin/login', label: '后台登录', icon: ShieldCheck, tone: 'primary' }]
      : [{ href: '/login', label: '学生登录', icon: BookOpenCheck, tone: 'primary' }];
  }

  if (isStudentRole(user.roleCode)) return STUDENT_NAV;

  if (!context.isAdminPath) {
    return [{ href: '/change-password', label: '改密', icon: KeyRound }];
  }

  return OPERATOR_NAV.filter((item) => {
    if (!item.permission) return true;
    return hasPermission({ user }, item.permission);
  });
}

export function AppShellHeader({
  user,
  logoutAction,
}: {
  user: SessionUser | null;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const isAdminPath = pathname.startsWith('/admin');
  const navItems = buildShellNav(user, { isAdminPath });
  const homeHref = isAdminPath && user && isStaffRole(user.roleCode) ? '/admin' : '/';

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href={homeHref} className="brand" aria-label="驾考工作台首页">
          <span className="brand-mark" aria-hidden="true">
            <ScrollText size={19} strokeWidth={2.4} />
          </span>
          <span className="brand-copy">
            <strong>驾考工作台</strong>
            <span>Practice Ops</span>
          </span>
        </Link>

        <nav className="nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className={item.tone === 'primary' ? 'nav-link nav-link-primary' : 'nav-link'}
                href={item.href}
                key={item.href}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {user ? (
            <>
              <span className="user-chip" title={user.username}>
                {user.name || user.username}
              </span>
              <form action={logoutAction}>
                <button type="submit" className="nav-link nav-button">
                  <LogOut size={16} aria-hidden="true" />
                  <span>退出</span>
                </button>
              </form>
            </>
      ) : (
        <span className="nav-hint">
          <LogIn size={15} aria-hidden="true" />
          <span>{isAdminPath ? '后台入口' : '学生入口'}</span>
        </span>
      )}
        </nav>
      </div>
    </header>
  );
}
