import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Hash, XCircle } from 'lucide-react';
import { notFound } from 'next/navigation';

import { QuestionAnalysis } from '@/components/question-analysis';
import { QuestionImage } from '@/components/question-image';
import { prisma } from '@/lib/db';
import { EXAM_MODE_LABEL, EXAM_STATUS_LABEL, formatDateTime, formatDuration, parseQuestionOptions } from '@/lib/display';
import type { ExamMode, ExamStatus } from '@/lib/enums';
import { requireUser } from '@/lib/server-session';

type HistoryDetailPageProps = {
  params: { attemptId: string };
};

export default async function HistoryDetailPage({ params }: HistoryDetailPageProps) {
  const user = requireUser('stats:self');
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: params.attemptId, userId: user.id },
    include: {
      bank: true,
      records: { include: { question: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!attempt || attempt.status === 'ONGOING') notFound();

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/exam/history">
          <ArrowLeft size={17} aria-hidden="true" />
          返回记录
        </Link>
        <h1>记录详情</h1>
        <p>
          {formatDateTime(attempt.startedAt)} · {attempt.bank?.name ?? '错题重做'} ·{' '}
          {EXAM_MODE_LABEL[attempt.mode as ExamMode]}
        </p>
      </div>
      <section className="grid">
        <Metric title="状态" value={EXAM_STATUS_LABEL[attempt.status as ExamStatus]} />
        <Metric title="成绩" value={`${attempt.score ?? 0} 分`} />
        <Metric title="正确" value={`${attempt.correctCount ?? 0}/${attempt.totalCount ?? 0}`} />
        <Metric title="用时" value={formatDuration(attempt.durationMs)} />
      </section>

      {attempt.records.map((record, index) => {
        const options = parseQuestionOptions(record.question.options);
        return (
          <article className="panel stack" key={record.id}>
            <div className="cluster">
              <span className={record.isCorrect ? 'badge good' : 'badge bad'}>
                {record.isCorrect ? (
                  <CheckCircle2 size={15} aria-hidden="true" />
                ) : (
                  <XCircle size={15} aria-hidden="true" />
                )}
                {record.isCorrect ? '正确' : '错误'}
              </span>
              <span className="badge">
                <Hash size={15} aria-hidden="true" />
                第 {index + 1} 题
              </span>
            </div>
            <h2>{record.question.content}</h2>
            {record.question.imageUrl ? <QuestionImage src={record.question.imageUrl} /> : null}
            <p>
              你的答案：{record.userAnswer || '未作答'}；正确答案：{record.question.answer}
            </p>
            <div className="stack">
              {options.map((option) => (
                <div
                  className="option"
                  key={option.key}
                  style={record.question.answer.includes(option.key) ? { borderColor: 'var(--success)' } : undefined}
                >
                  <strong>{option.key}</strong>
                  <span>{option.text}</span>
                </div>
              ))}
            </div>
            <QuestionAnalysis answer={record.question.answer} explanation={record.question.explanation} />
          </article>
        );
      })}
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="card">
      <p className="muted">{title}</p>
      <strong style={{ fontSize: '1.8rem' }}>{value}</strong>
    </div>
  );
}
