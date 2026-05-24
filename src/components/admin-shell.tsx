'use client';

import { useState } from 'react';
import { Topbar } from './topbar';
import { Sidebar } from './sidebar';
import type { NavItem } from '@/lib/nav-config';
import { cn } from '@/lib/utils';

export function AdminShell({
  user,
  navItems,
  children,
}: {
  user: { name: string; username: string; roleName: string };
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      <Topbar
        title="驾考答题系统"
        badge="管理后台"
        name={user.name}
        username={user.username}
        roleName={user.roleName}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <div className="flex flex-1">
        <aside
          className={cn(
            'fixed inset-y-14 left-0 z-20 w-64 bg-background border-r overflow-y-auto transition-transform lg:relative lg:inset-y-0 lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
        >
          <Sidebar items={navItems} />
        </aside>
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-10 bg-black/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className="flex-1 p-4 sm:p-6 max-w-full overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
