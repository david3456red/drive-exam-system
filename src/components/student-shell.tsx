'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Topbar } from './topbar';
import { NavIcon } from './nav-icon';
import type { NavItem } from '@/lib/nav-config';
import { cn } from '@/lib/utils';

export function StudentShell({
  user,
  navItems,
  children,
}: {
  user: { name: string; username: string; roleName: string };
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50/40 via-white to-white dark:from-slate-900 dark:via-slate-950 dark:to-slate-950">
      <Topbar
        title="驾考答题"
        name={user.name}
        username={user.username}
        roleName={user.roleName}
      />

      {/* Sticky tab bar below header */}
      <nav className="sticky top-14 z-20 bg-background/95 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-2 flex overflow-x-auto">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex-1 min-w-[6rem] flex items-center justify-center gap-1.5 py-3 px-3 text-sm whitespace-nowrap border-b-2 transition-colors',
                  active
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <NavIcon iconKey={item.iconKey} className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
