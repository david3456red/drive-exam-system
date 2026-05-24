import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { EditRoleForm } from './edit-role-form';

export default async function EditRolePage({ params }: { params: { id: string } }) {
  const session = await auth();
  // Only super_admin can edit role permissions.
  if (!session?.user || session.user.roleName !== 'super_admin') {
    redirect('/admin/roles');
  }

  const role = await prisma.role.findUnique({
    where: { id: params.id },
    include: {
      permissions: { select: { permissionId: true } },
      _count: { select: { users: true } },
    },
  });
  if (!role) notFound();
  if (role.name === 'super_admin') {
    redirect('/admin/roles');
  }

  const allPermissions = await prisma.permission.findMany({
    orderBy: [{ groupName: 'asc' }, { code: 'asc' }],
  });

  const ownedIds = role.permissions.map((rp) => rp.permissionId);

  // Group permissions for display
  const groups = new Map<string, typeof allPermissions>();
  for (const p of allPermissions) {
    const g = p.groupName || '其他';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }
  const grouped = Array.from(groups.entries()).map(([name, items]) => ({ name, items }));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/roles">← 返回角色列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            编辑角色权限 — {role.displayName}
          </CardTitle>
          <CardDescription>
            <span className="font-mono">{role.name}</span>
            {role.isBuiltin && <span className="ml-2 text-xs text-blue-600">内置角色</span>}
            {role.strictLogin && <span className="ml-2 text-xs text-red-600">异地登录冻结</span>}
            <span className="ml-2 text-xs">· 当前关联用户: {role._count.users}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditRoleForm roleId={role.id} groups={grouped} initialOwned={ownedIds} />
        </CardContent>
      </Card>
    </div>
  );
}
