import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Hash, XCircle } from 'lucide-react';
import { notFound } from 'next/navigation';

import { QuestionImage } from '@/components/question-image';
import { prisma } from '@/lib/db';
import { EXAM_MODE_LABEL, EXAM_STATUS_LABEL, formatDuration, parseQuestionOptions } from '@/lib/display';
import type { ExamMode, ExamStatus } from '@/lib/enums';
import { parseOrder } from '@/lib/exam-engine/snapshot';
import { requireUser } from '@/lib/server-session';

type ResultPageProps = {
  params: { attemptId: string };
};

export default async function ResultPage({ params }: ResultPageProps) {
  const user = requireUser('exam:practice');
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: params.attemptId, userId: user.id },
    include: {
      bank: true,
      records: { include: { question: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!attempt) notFound();

  const total = attempt.totalCount ?? attempt.records.length;
  const correct = attempt.correctCount ?? attempt.records.filter((record) => record.isCorrect).length;
  const score = attempt.score ?? (total === 0 ? 0 : Math.round((correct / total) * 100));
  const order = parseOrder(attempt.questionOrder);
  const recordByQuestion = new Map(attempt.records.map((record) => [record.questionId, record]));
  const orderedRecords = order
    .map((questionId) => recordByQuestion.get(questionId))
    .filter((record): record is (typeof attempt.records)[number] => Boolean(record));

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/exam">
          <ArrowLeft size={17} aria-hidden="true" />
          返回练习
        </Link>
        <h1>答题结果</h1>
        <p>{attempt.bank?.name ?? '错题重做'} · {EXAM_MODE_LABEL[attempt.mode as ExamMode]}</p>
      </div>

      <section className="grid">
        <Metric title="状态" value={EXAM_STATUS_LABEL[attempt.status as ExamStatus]} />
        <Metric title="得分" value={`${score}`} />
        <Metric title="正确" value={`${correct}/${total}`} />
        <Metric title="用时" value={formatDuration(attempt.durationMs)} />
      </section>

      {attempt.mode === 'MOCK' ? (
        <div className={score >= 90 ? 'notice' : 'error'}>
          模拟考试{score >= 90 ? '已通过' : '未通过'}，合格线为 90 分。
        </div>
      ) : null}

      <section className="stack">
        {orderedRecords.map((record, index) => {
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
                <span className="muted">耗时 {formatDuration(record.costMs)}</span>
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
              {record.question.explanation ? <p className="muted">{record.question.explanation}</p> : null}
            </article>
          );
        })}
      </section>
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
