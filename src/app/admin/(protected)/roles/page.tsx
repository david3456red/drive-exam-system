import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function RolesPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'role:read')) redirect('/admin');

  const canEdit = hasPermission(session!.user, 'role:update');
  const isSuperAdmin = session!.user.roleName === 'super_admin';

  const roles = await prisma.role.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { users: true, permissions: true } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">角色权限</h1>
      <p className="text-muted-foreground text-sm">
        点击 <span className="font-medium text-foreground">「编辑」</span> 修改角色拥有的权限。
        权限变更会在用户<span className="font-medium text-foreground">下次登录</span>时生效。
        只有超级管理员可以编辑权限。
      </p>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => {
          // super_admin's permissions are always-all (hard-coded), so skip edit.
          const editable = canEdit && isSuperAdmin && r.name !== 'super_admin';
          return (
            <Card key={r.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{r.displayName}</span>
                  <div className="flex items-center gap-1">
                    {r.strictLogin && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        异地冻结
                      </span>
                    )}
                    {r.isBuiltin && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        内置
                      </span>
                    )}
                  </div>
                </CardTitle>
                <div className="text-xs text-muted-foreground font-mono">{r.name}</div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col text-sm space-y-2">
                <div>
                  用户数: <span className="font-mono">{r._count.users}</span>
                </div>
                <div>
                  权限点:{' '}
                  <span className="font-mono">
                    {r.name === 'super_admin' ? '全部' : r._count.permissions}
                  </span>
                </div>
                <div className="flex-1" />
                <div className="pt-2">
                  {editable ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/roles/${r.id}/edit`}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> 编辑权限
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {r.name === 'super_admin' ? '超级管理员永远拥有全部权限' : '无编辑权限'}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
