import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { StudentShell } from '@/components/student-shell';
import { NextAuthProvider } from '@/components/session-provider';
import { STUDENT_NAV } from '@/lib/nav-config';
import { hasPermission } from '@/lib/permissions';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const u = session.user;

  // Filter nav by permission. (Admins have all `exam:*` perms too via super_admin
  // shortcut, so they can preview the student portal if they navigate here.)
  const visibleItems = STUDENT_NAV.filter((item) => {
    if (!item.permission) return true;
    return hasPermission(u, item.permission);
  });

  return (
    <NextAuthProvider>
      <StudentShell
        user={{ name: u.name ?? u.username, username: u.username, roleName: u.roleName }}
        navItems={visibleItems}
      >
        {children}
      </StudentShell>
    </NextAuthProvider>
  );
}
