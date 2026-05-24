import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AdminShell } from '@/components/admin-shell';
import { NextAuthProvider } from '@/components/session-provider';
import { ADMIN_NAV } from '@/lib/nav-config';
import { hasPermission } from '@/lib/permissions';
import { isBackendRole } from '@/lib/role-checks';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // The middleware also enforces this, but defence-in-depth.
  if (!session?.user) redirect('/admin/login');
  if (!isBackendRole(session.user.roleName)) redirect('/exam');

  const u = session.user;

  const visibleItems = ADMIN_NAV.filter((item) => {
    if (!item.permission) return true;
    return hasPermission(u, item.permission);
  });

  return (
    <NextAuthProvider>
      <AdminShell
        user={{ name: u.name ?? u.username, username: u.username, roleName: u.roleName }}
        navItems={visibleItems}
      >
        {children}
      </AdminShell>
    </NextAuthProvider>
  );
}
