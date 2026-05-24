import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { CategoriesClient, type CategoryRow } from './categories-client';

export default async function CategoriesPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'category:read')) redirect('/admin');

  const u = session!.user;
  const canCreate = hasPermission(u, 'category:create');
  const canUpdate = hasPermission(u, 'category:update');
  const canDelete = hasPermission(u, 'category:delete');

  const cats = await prisma.category.findMany({
    orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      parent: { select: { name: true } },
      _count: { select: { questions: true, children: true } },
    },
  });

  const rows: CategoryRow[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
    sortOrder: c.sortOrder,
    questionCount: c._count.questions,
    childCount: c._count.children,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">分类</h1>
        <p className="text-muted-foreground text-sm mt-1">
          全局分类管理。同一个分类可以挂载在不同题库的题目上,适合驾考这种「多题库共享标签」的场景。
        </p>
      </div>

      <CategoriesClient
        rows={rows}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </div>
  );
}
