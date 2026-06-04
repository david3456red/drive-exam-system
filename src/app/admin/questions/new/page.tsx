import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { createQuestionAction } from '@/app/admin/actions';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/server-session';
import { QuestionForm } from '../question-form';

type NewQuestionPageProps = {
  searchParams?: { error?: string };
};

export default async function NewQuestionPage({ searchParams }: NewQuestionPageProps) {
  requireUser('question:write');
  const [banks, categories] = await Promise.all([
    prisma.questionBank.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.category.findMany({ orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }] }),
  ]);

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin/questions">
          <ArrowLeft size={17} aria-hidden="true" />
          返回题目
        </Link>
        <h1>新建题目</h1>
        <p>单选和多选使用 A-F 选项；判断题会自动使用“正确/错误”两个固定选项。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}

      <QuestionForm action={createQuestionAction} banks={banks} categories={categories} mode="new" />
    </main>
  );
}
