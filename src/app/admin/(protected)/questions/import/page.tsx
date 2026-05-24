import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ImportForm } from './import-form';

export default async function ImportQuestionsPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'question:import')) redirect('/admin/questions');

  const banks = await prisma.questionBank.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, code: true },
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/questions">← 返回题目列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>批量导入题目</CardTitle>
          <CardDescription>
            支持 JSON 与 Excel 两种格式。导入流程:选择题库 → 粘贴/上传 → 预览校验 → 确认导入。
            导入时未存在的分类会自动创建(顶层),已存在的分类会复用。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportForm banks={banks} />
        </CardContent>
      </Card>
    </div>
  );
}
