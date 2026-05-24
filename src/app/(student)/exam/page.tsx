import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function ExamHomePage() {
  const session = await auth();
  const u = session!.user;

  const banks = await prisma.questionBank.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { questions: true, categories: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">你好,{u.name ?? u.username} 👋</h1>
        <p className="text-muted-foreground text-sm">选择一个题库开始练习</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {banks.map((b) => (
          <Card key={b.id} className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="text-lg">{b.name}</CardTitle>
              <CardDescription>{b.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>共 <span className="font-mono text-foreground">{b._count.questions}</span> 题</div>
              <div className="text-xs">{b._count.categories} 个分类</div>
            </CardContent>
          </Card>
        ))}
        {banks.length === 0 && (
          <Card className="sm:col-span-2">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              暂无可用题库,请联系管理员录入题目。
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">📝 答题模式</CardTitle>
          <CardDescription>P3 阶段 — 开发中</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          顺序练习 · 随机练习 · 按章节(自定义分类)练习 · 模拟考试 · 错题重做
        </CardContent>
      </Card>
    </div>
  );
}
