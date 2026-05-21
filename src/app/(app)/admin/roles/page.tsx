import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function RolesPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'role:read')) redirect('/dashboard');

  const roles = await prisma.role.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { users: true, permissions: true } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">角色权限</h1>
      <p className="text-muted-foreground text-sm">P4 阶段将实现:角色 CRUD、权限分配、自定义角色。</p>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{r.displayName}</span>
                {r.strictLogin && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">异地冻结</span>
                )}
              </CardTitle>
              <div className="text-xs text-muted-foreground font-mono">{r.name}</div>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>用户数: <span className="font-mono">{r._count.users}</span></div>
              <div>权限点: <span className="font-mono">{r._count.permissions}</span></div>
              {r.isBuiltin && <div className="text-xs text-blue-600">内置角色</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
