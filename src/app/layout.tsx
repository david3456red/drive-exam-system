import type { Metadata } from 'next';

import { logoutAction } from '@/app/actions/auth';
import { AppShellHeader } from '@/components/app-shell';
import './globals.css';
import { getCurrentUser } from '@/lib/server-session';

export const metadata: Metadata = {
  title: '驾考工作台',
  description: '驾考练习、模拟考试、错题复盘和题库运营工作台',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = getCurrentUser();

  return (
    <html lang="zh-CN">
      <body>
        <div className="shell">
          <AppShellHeader user={user} logoutAction={logoutAction} />
          {children}
        </div>
      </body>
    </html>
  );
}
