'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/nav-config';

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  // Group items by `group` preserving order.
  const groups: { name: string; items: NavItem[] }[] = [];
  const groupIndex = new Map<string, number>();
  for (const it of items) {
    const g = it.group ?? '';
    if (!groupIndex.has(g)) {
      groupIndex.set(g, groups.length);
      groups.push({ name: g, items: [] });
    }
    groups[groupIndex.get(g)!].items.push(it);
  }

  return (
    <nav className="flex flex-col gap-6 p-4">
      {groups.map((g) => (
        <div key={g.name}>
          {g.name && (
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
              {g.name}
            </div>
          )}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
