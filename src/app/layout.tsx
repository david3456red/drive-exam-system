import type { Metadata } from 'next';
import Link from 'next/link';

import { logoutAction } from '@/app/actions/auth';
import './globals.css';
import { getCurrentUser } from '@/lib/server-session';
import { homeForRole } from '@/lib/session-shared';

export const metadata: Metadata = {
  title: '驾考答题系统',
  description: '轻量可部署的驾考练习、模拟考试和题库管理系统',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = getCurrentUser();

  return (
    <html lang="zh-CN">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="topbar-inner">
              <Link href="/" className="brand">
                <span className="brand-mark">考</span>
                <span>驾考答题系统</span>
              </Link>
              <nav className="nav" aria-label="主导航">
                {user ? (
                  <>
                    <Link href={homeForRole(user.roleCode)}>工作台</Link>
                    <Link href="/change-password">改密</Link>
                    <span className="badge">{user.name || user.username}</span>
                    <form action={logoutAction}>
                      <button type="submit" className="ghost">
                        退出
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link href="/login">学生登录</Link>
                    <Link href="/admin/login">后台登录</Link>
                  </>
                )}
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
