import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { parseOptions, parseTags, type QuestionType } from '@/lib/question-types';
import { QuestionForm } from '../question-form';

export default async function EditQuestionPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!hasPermission(session!.user, 'question:update')) redirect('/admin/questions');

  const [question, banks] = await Promise.all([
    prisma.question.findUnique({
      where: { id: params.id },
      include: { categories: { select: { categoryId: true } } },
    }),
    prisma.questionBank.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, code: true },
    }),
  ]);
  if (!question) notFound();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/questions">← 返回题目列表</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>编辑题目</CardTitle>
        </CardHeader>
        <CardContent>
          <QuestionForm
            banks={banks}
            initial={{
              id: question.id,
              bankId: question.bankId,
              type: question.type as QuestionType,
              content: question.content,
              imageUrl: question.imageUrl,
              options: parseOptions(question.options),
              answer: question.answer,
              explanation: question.explanation,
              categoryIds: question.categories.map((c) => c.categoryId),
              tags: parseTags(question.tags),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
