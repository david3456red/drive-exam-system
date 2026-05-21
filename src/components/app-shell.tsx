'use client';

import { useState } from 'react';
import { Topbar } from './topbar';
import { Sidebar } from './sidebar';
import type { NavItem } from '@/lib/nav-config';
import { cn } from '@/lib/utils';

export function AppShell({
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
    <div className="min-h-screen flex flex-col">
      <Topbar
        name={user.name}
        username={user.username}
        roleName={user.roleName}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <div className="flex flex-1">
        {/* Sidebar (drawer on mobile, fixed on lg+) */}
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
        <main className="flex-1 p-6 max-w-full overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
