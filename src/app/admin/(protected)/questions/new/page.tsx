import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { QuestionForm } from '../question-form';

export default async function NewQuestionPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'question:create')) redirect('/admin/questions');

  const banks = await prisma.questionBank.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, code: true },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/questions">← 返回题目列表</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>新建题目</CardTitle>
        </CardHeader>
        <CardContent>
          <QuestionForm banks={banks} />
        </CardContent>
      </Card>
    </div>
  );
}
