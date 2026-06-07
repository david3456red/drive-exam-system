import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  Hash,
  Trash2,
  XCircle,
} from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import {
  abandonAttemptAction,
  finishAttemptAction,
  goToQuestionAction,
  submitAnswerAction,
} from '@/app/exam/actions';
import { QuestionAnalysis } from '@/components/question-analysis';
import { QuestionImage } from '@/components/question-image';
import { prisma } from '@/lib/db';
import {
  EXAM_MODE_LABEL,
  QUESTION_TYPE_LABEL,
  parseQuestionOptions,
} from '@/lib/display';
import { buildAnswerCardItems } from '@/lib/exam-engine/answer-card';
import { parseOrder } from '@/lib/exam-engine/snapshot';
import { requireUser } from '@/lib/server-session';
import { QuestionAnswerForm } from './answer-form';
import { AnswerCard } from './answer-card';
import { MockEffects } from './mock-effects';

type SessionPageProps = {
  params: { attemptId: string };
  searchParams?: { error?: string };
};

export default async function SessionPage({
  params,
  searchParams,
}: SessionPageProps) {
  const user = requireUser('exam:practice');
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: params.attemptId, userId: user.id },
    include: { bank: true },
  });
  if (!attempt) notFound();
  if (attempt.status !== 'ONGOING') redirect(`/exam/session/${attempt.id}/result`);

  const order = parseOrder(attempt.questionOrder);
  if (order.length === 0) {
    return (
      <main className="page">
        <div className="empty">本次会话没有可用题目。</div>
      </main>
    );
  }

  const currentIndex = Math.min(Math.max(attempt.currentIndex, 0), order.length - 1);
  const questionId = order[currentIndex];
  const [question, records] = await Promise.all([
    questionId ? prisma.question.findUnique({ where: { id: questionId } }) : null,
    prisma.examRecord.findMany({
      where: { attemptId: attempt.id },
      select: { questionId: true, userAnswer: true, isCorrect: true },
    }),
  ]);
  if (!question) notFound();

  const recordByQuestionId = new Map(records.map((record) => [record.questionId, record]));
  const currentRecord = recordByQuestionId.get(question.id);
  const revealCorrectness = attempt.mode !== 'MOCK';
  const lockedPracticeAnswer = revealCorrectness && Boolean(currentRecord);
  const answerCardItems = buildAnswerCardItems({
    order,
    records,
    currentIndex,
    revealCorrectness,
  });

  const options = parseQuestionOptions(question.options);

  return (
    <main className="page stack">
      <div className="cluster session-toolbar">
        <Link className="button" href="/exam">
          <ArrowLeft size={17} aria-hidden="true" />
          返回练习
        </Link>
        <span className="badge">
          <ClipboardCheck size={15} aria-hidden="true" />
          {EXAM_MODE_LABEL[attempt.mode as keyof typeof EXAM_MODE_LABEL]}
        </span>
        <span className="badge">
          <Hash size={15} aria-hidden="true" />
          第 {currentIndex + 1} / {order.length} 题
        </span>
        {attempt.mode === 'MOCK' && attempt.expiresAt ? (
          <MockEffects attemptId={attempt.id} expiresAt={attempt.expiresAt.toISOString()} />
        ) : null}
      </div>

      <div className="exam-session-layout">
        <div className="exam-session-main stack">
          {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}

          <section className="question panel stack">
            <div className="cluster">
              <span className="badge">
                <ClipboardCheck size={15} aria-hidden="true" />
                {QUESTION_TYPE_LABEL[question.type as keyof typeof QUESTION_TYPE_LABEL]}
              </span>
              <span className="muted">题号 {currentIndex + 1}</span>
              {lockedPracticeAnswer && currentRecord ? (
                <span className={currentRecord.isCorrect ? 'badge good' : 'badge bad'}>
                  {currentRecord.isCorrect ? (
                    <CheckCircle2 size={15} aria-hidden="true" />
                  ) : (
                    <XCircle size={15} aria-hidden="true" />
                  )}
                  {currentRecord.isCorrect ? '回答正确' : '回答错误'}
                </span>
              ) : null}
              {lockedPracticeAnswer ? <span className="badge warn">已判题，不能修改</span> : null}
            </div>
            <h1>{question.content}</h1>
            {question.imageUrl ? <QuestionImage src={question.imageUrl} /> : null}

            {lockedPracticeAnswer ? (
              <div className="stack">
                <p className="muted">
                  你的答案：{currentRecord?.userAnswer || '未作答'}；正确答案：{question.answer}
                </p>
                {options.map((option) => (
                  <div
                    className="option"
                    key={option.key}
                    style={
                      question.answer.includes(option.key)
                        ? { borderColor: 'var(--success)' }
                        : currentRecord?.userAnswer.includes(option.key)
                          ? { borderColor: 'var(--danger)' }
                          : undefined
                    }
                  >
                    <strong>{option.key}</strong>
                    <span>{option.text}</span>
                  </div>
                ))}
                <QuestionAnalysis answer={question.answer} explanation={question.explanation} />
              </div>
            ) : (
              <QuestionAnswerForm
                action={submitAnswerAction}
                attemptId={attempt.id}
                currentAnswer={currentRecord?.userAnswer}
                options={options}
                questionId={question.id}
                questionType={question.type}
                submitLabel={currentRecord && attempt.mode === 'MOCK' ? '更新答案' : '提交答案'}
              />
            )}
          </section>

          <div className="cluster question">
            <form action={finishAttemptAction}>
              <input type="hidden" name="attemptId" value={attempt.id} />
              <button className="primary" type="submit">
                <Flag size={17} aria-hidden="true" />
                交卷
              </button>
            </form>
            <form action={abandonAttemptAction}>
              <input type="hidden" name="attemptId" value={attempt.id} />
              <button className="danger" type="submit">
                <Trash2 size={17} aria-hidden="true" />
                放弃本次练习
              </button>
            </form>
          </div>
        </div>

        <AnswerCard
          action={goToQuestionAction}
          attemptId={attempt.id}
          items={answerCardItems}
        />
      </div>
    </main>
  );
}
