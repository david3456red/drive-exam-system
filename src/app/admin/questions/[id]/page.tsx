import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ClipboardList, Trash2 } from 'lucide-react';
import { notFound } from 'next/navigation';

import { deleteQuestionAction } from '@/app/admin/actions';
import { prisma } from '@/lib/db';
import { QUESTION_TYPE_LABEL, parseQuestionOptions } from '@/lib/display';
import type { QuestionType } from '@/lib/enums';
import { requireUser } from '@/lib/server-session';

type QuestionDetailPageProps = {
  params: { id: string };
  searchParams?: { error?: string; notice?: string };
};

export default async function QuestionDetailPage({ params, searchParams }: QuestionDetailPageProps) {
  requireUser('question:read');
  const question = await prisma.question.findUnique({
    where: { id: params.id },
    include: {
      bank: true,
      categories: { include: { category: true } },
      _count: { select: { records: true, wrongs: true } },
    },
  });
  if (!question) notFound();

  const options = parseQuestionOptions(question.options);
  const tags = parseStringArray(question.tags);

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin/questions">
          <ArrowLeft size={17} aria-hidden="true" />
          返回题目
        </Link>
        <h1>题目详情</h1>
        <p>查看题干、答案、选项和使用情况。已有答题记录的题目建议谨慎删除。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}
      {searchParams?.notice ? <div className="notice">{searchParams.notice}</div> : null}

      <section className="panel stack">
        <div className="cluster">
          <span className="badge">
            <ClipboardList size={15} aria-hidden="true" />
            {question.bank.name}
          </span>
          <span className="badge">
            <ClipboardList size={15} aria-hidden="true" />
            {QUESTION_TYPE_LABEL[question.type as QuestionType]}
          </span>
          <span className="badge good">
            <CheckCircle2 size={15} aria-hidden="true" />
            答案 {question.answer}
          </span>
          <span className="badge">答题记录 {question._count.records}</span>
          <span className="badge warn">错题记录 {question._count.wrongs}</span>
        </div>
        <h2>{question.content}</h2>
        {question.imageUrl ? <p className="muted">图片：{question.imageUrl}</p> : null}
        <div className="stack">
          {options.map((option) => (
            <div
              className="option"
              key={option.key}
              style={question.answer.includes(option.key) ? { borderColor: 'var(--success)' } : undefined}
            >
              <strong>{option.key}</strong>
              <span>{option.text}</span>
            </div>
          ))}
        </div>
        {question.explanation ? <p>{question.explanation}</p> : null}
        <div className="cluster">
          {question.categories.map((item) => (
            <span className="badge" key={item.categoryId}>
              {item.category.name}
            </span>
          ))}
          {tags.map((tag) => (
            <span className="badge" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </section>

      <form action={deleteQuestionAction}>
        <input type="hidden" name="id" value={question.id} />
        <button className="danger" disabled={question._count.records + question._count.wrongs > 0} type="submit">
          <Trash2 size={17} aria-hidden="true" />
          删除题目
        </button>
      </form>
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
