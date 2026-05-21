import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AppShell } from '@/components/app-shell';
import { NextAuthProvider } from '@/components/session-provider';
import { NAV_ITEMS } from '@/lib/nav-config';
import { hasPermission } from '@/lib/permissions';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.mustChangePassword) redirect('/change-password');

  const u = session.user;

  // Filter nav items by permission.
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.permission) return true;
    return hasPermission(
      {
        id: u.id,
        username: u.username,
        name: u.name,
        roleName: u.roleName,
        permissions: u.permissions,
        mustChangePassword: u.mustChangePassword,
      },
      item.permission,
    );
  });

  return (
    <NextAuthProvider>
      <AppShell
        user={{ name: u.name ?? u.username, username: u.username, roleName: u.roleName }}
        navItems={visibleItems}
      >
        {children}
      </AppShell>
    </NextAuthProvider>
  );
}
