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
    include: { _count: { select: { questions: true } } },
  });
  if (!bank) notFound();

  // "Categories of this bank" = categories tagged on at least one question
  // belonging to this bank (categories are global, not bank-scoped).
  const usage = await prisma.questionCategory.groupBy({
    by: ['categoryId'],
    where: { question: { bankId: bank.id } },
    _count: { _all: true },
  });
  const categoryIds = usage.map((u) => u.categoryId);
  const categoryRows = categoryIds.length
    ? await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];
  const usageById = new Map(usage.map((u) => [u.categoryId, u._count._all]));
  const categories = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    questionCount: usageById.get(c.id) ?? 0,
  }));

  const canUpdateBank = hasPermission(u, 'bank:update');

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

      <CategorySection categories={categories} />

      <div className="text-sm text-muted-foreground border-t pt-4">
        题库共 <span className="font-mono text-foreground">{bank._count.questions}</span> 道题。
        管理题目请去 <Link href="/admin/questions" className="text-primary underline">题目页</Link>。
      </div>
    </div>
  );
}
