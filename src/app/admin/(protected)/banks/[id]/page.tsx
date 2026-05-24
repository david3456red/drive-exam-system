import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BankForm } from '../bank-form';
import { CategorySection } from './category-section';

export default async function BankEditPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const u = session!.user;
  if (!hasPermission(u, 'bank:read')) redirect('/admin/banks');

  const bank = await prisma.questionBank.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { questions: true } },
      categories: {
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { questions: true } } },
      },
    },
  });
  if (!bank) notFound();

  const canUpdateBank = hasPermission(u, 'bank:update');
  const canCreateCat = hasPermission(u, 'category:create');
  const canUpdateCat = hasPermission(u, 'category:update');
  const canDeleteCat = hasPermission(u, 'category:delete');

  const initialCategories = bank.categories.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    questionCount: c._count.questions,
  }));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/banks">← 返回题库列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>编辑题库 — {bank.name}</CardTitle>
        </CardHeader>
        <CardContent>
          {canUpdateBank ? (
            <BankForm
              initial={{
                id: bank.id,
                code: bank.code,
                name: bank.name,
                description: bank.description,
                sortOrder: bank.sortOrder,
                isActive: bank.isActive,
                isBuiltin: bank.isBuiltin,
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">无修改权限,只读查看。</p>
          )}
        </CardContent>
      </Card>

      <CategorySection
        bankId={bank.id}
        initial={initialCategories}
        canCreate={canCreateCat}
        canUpdate={canUpdateCat}
        canDelete={canDeleteCat}
      />

      <div className="text-sm text-muted-foreground border-t pt-4">
        题库共 <span className="font-mono text-foreground">{bank._count.questions}</span> 道题。
        管理题目请去 <Link href="/admin/questions" className="text-primary underline">题目页</Link>。
      </div>
    </div>
  );
}
