import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteBankButton } from './delete-bank-button';

export default async function BanksPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'bank:read')) redirect('/admin');

  const u = session!.user;
  const canCreate = hasPermission(u, 'bank:create');
  const canUpdate = hasPermission(u, 'bank:update');
  const canDelete = hasPermission(u, 'bank:delete');

  const banks = await prisma.questionBank.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { questions: true, categories: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">题库</h1>
          <p className="text-muted-foreground text-sm mt-1">管理所有题库,分类管理在题库详情页内。</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/admin/banks/new">
              <Plus className="h-4 w-4 mr-1" /> 新建题库
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {banks.map((b) => (
          <Card key={b.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>{b.name}</span>
                <div className="flex gap-1">
                  {b.isBuiltin && <Badge variant="secondary">内置</Badge>}
                  {!b.isActive && <Badge variant="muted">停用</Badge>}
                </div>
              </CardTitle>
              <CardDescription className="font-mono text-xs">{b.code}</CardDescription>
              {b.description && (
                <p className="text-sm text-muted-foreground mt-1">{b.description}</p>
              )}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col text-sm space-y-1">
              <div>题目: <span className="font-mono">{b._count.questions}</span></div>
              <div>分类: <span className="font-mono">{b._count.categories}</span></div>
              <div className="flex-1" />
              <div className="flex gap-2 pt-3 flex-wrap">
                {canUpdate && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/banks/${b.id}`}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> 编辑
                    </Link>
                  </Button>
                )}
                {canDelete && !b.isBuiltin && (
                  <DeleteBankButton
                    id={b.id}
                    name={b.name}
                    questionCount={b._count.questions}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
