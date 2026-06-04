import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';

import { updateQuestionAction } from '@/app/admin/actions';
import { prisma } from '@/lib/db';
import { parseQuestionOptions } from '@/lib/display';
import type { QuestionType } from '@/lib/enums';
import { requireUser } from '@/lib/server-session';
import { QuestionForm, type QuestionFormInitialQuestion } from '../../question-form';

type EditQuestionPageProps = {
  params: { id: string };
  searchParams?: { error?: string };
};

export default async function EditQuestionPage({ params, searchParams }: EditQuestionPageProps) {
  requireUser('question:write');
  const [question, banks, categories] = await Promise.all([
    prisma.question.findUnique({
      where: { id: params.id },
      include: {
        categories: true,
        _count: { select: { records: true, wrongs: true } },
      },
    }),
    prisma.questionBank.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.category.findMany({ orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }] }),
  ]);
  if (!question) notFound();

  const lockedScoringFields = question._count.records + question._count.wrongs > 0;
  const initialQuestion: QuestionFormInitialQuestion = {
    id: question.id,
    bankId: question.bankId,
    type: question.type as QuestionType,
    content: question.content,
    imageUrl: question.imageUrl,
    options: parseQuestionOptions(question.options),
    answer: question.answer,
    explanation: question.explanation,
    tags: parseStringArray(question.tags),
    categoryIds: question.categories.map((item) => item.categoryId),
  };

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href={`/admin/questions/${question.id}`}>
          <ArrowLeft size={17} aria-hidden="true" />
          返回详情
        </Link>
        <h1>编辑题目</h1>
        <p>
          {lockedScoringFields
            ? '已有答题或错题记录，题型、答案和选项已锁定。'
            : '未产生答题记录，可完整调整题目内容。'}
        </p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}

      <QuestionForm
        action={updateQuestionAction}
        banks={banks}
        categories={categories}
        mode="edit"
        initialQuestion={initialQuestion}
        lockedScoringFields={lockedScoringFields}
      />
    </main>
  );
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
