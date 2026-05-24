import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function BanksPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'bank:read')) redirect('/admin');

  const banks = await prisma.questionBank.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { questions: true, categories: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">题库</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        P2 阶段:题库 CRUD、自定义分类、新建题库,JSON / Excel 批量导入题目。
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {banks.map((b) => (
          <Card key={b.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{b.name}</span>
                {!b.isActive && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">已停用</span>
                )}
                {b.isBuiltin && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">内置</span>
                )}
              </CardTitle>
              <CardDescription>{b.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>题目数量: <span className="font-mono">{b._count.questions}</span></div>
              <div>分类数量: <span className="font-mono">{b._count.categories}</span></div>
              <div className="text-muted-foreground text-xs font-mono">code: {b.code}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
