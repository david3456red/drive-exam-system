import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function QuestionsPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'question:read')) redirect('/dashboard');

  const banks = await prisma.questionBank.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { questions: true, categories: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">题库管理</h1>
      <p className="text-muted-foreground text-sm">P2 阶段将实现:题库 CRUD、自定义分类、JSON / Excel 批量导入。</p>

      <div className="grid gap-4 md:grid-cols-2">
        {banks.map((b) => (
          <Card key={b.id}>
            <CardHeader>
              <CardTitle>{b.name}</CardTitle>
              <CardDescription>{b.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>题目数量: <span className="font-mono">{b._count.questions}</span></div>
              <div>分类数量: <span className="font-mono">{b._count.categories}</span></div>
              <div className="text-muted-foreground text-xs">code: {b.code}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
