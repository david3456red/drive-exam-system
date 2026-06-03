import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  Hash,
  Send,
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
import { AnswerCard } from './answer-card';
import { CostInput } from './cost-input';
import { MockEffects } from './mock-effects';

type SessionPageProps = {
  params: { attemptId: string };
  searchParams?: { feedback?: string; error?: string };
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
  const lockedPracticeAnswer = revealCorrectness && currentRecord;
  const answerCardItems = buildAnswerCardItems({
    order,
    records,
    currentIndex,
    revealCorrectness,
  });

  const options = parseQuestionOptions(question.options);
  const feedbackQuestionId =
    revealCorrectness ? searchParams?.feedback ?? (currentRecord ? question.id : undefined) : undefined;
  const feedback = feedbackQuestionId
    ? await prisma.examRecord.findFirst({
        where: { attemptId: attempt.id, questionId: feedbackQuestionId },
        include: { question: true },
      })
    : null;
  const feedbackOptions = feedback
    ? parseQuestionOptions(feedback.question.options)
    : [];

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

          {feedback && revealCorrectness ? (
            <section className="panel stack">
              <div className="cluster">
                <span className={feedback.isCorrect ? 'badge good' : 'badge bad'}>
                  {feedback.isCorrect ? (
                    <CheckCircle2 size={15} aria-hidden="true" />
                  ) : (
                    <XCircle size={15} aria-hidden="true" />
                  )}
                  {feedback.isCorrect ? '回答正确' : '回答错误'}
                </span>
                <strong>{feedback.question.content}</strong>
              </div>
              <p>
                你的答案：{feedback.userAnswer || '未作答'}；正确答案：
                {feedback.question.answer}
              </p>
              {feedback.question.explanation ? (
                <p className="muted">{feedback.question.explanation}</p>
              ) : null}
              <div className="stack">
                {feedbackOptions.map((option) => (
                  <div
                    className="option"
                    key={option.key}
                    style={
                      feedback.question.answer.includes(option.key)
                        ? { borderColor: 'var(--success)' }
                        : feedback.userAnswer.includes(option.key)
                          ? { borderColor: 'var(--danger)' }
                          : undefined
                    }
                  >
                    <strong>{option.key}</strong>
                    <span>{option.text}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="question panel stack">
            <div className="cluster">
              <span className="badge">
                <ClipboardCheck size={15} aria-hidden="true" />
                {QUESTION_TYPE_LABEL[question.type as keyof typeof QUESTION_TYPE_LABEL]}
              </span>
              <span className="muted">题号 {question.id.slice(-6)}</span>
              {lockedPracticeAnswer ? <span className="badge warn">已判题，不能修改</span> : null}
            </div>
            <h1>{question.content}</h1>
            {question.imageUrl ? <QuestionImage src={question.imageUrl} /> : null}

            {lockedPracticeAnswer ? (
              <div className="stack">
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
              </div>
            ) : (
              <form action={submitAnswerAction} className="stack">
                <input type="hidden" name="attemptId" value={attempt.id} />
                <input type="hidden" name="questionId" value={question.id} />
                <CostInput />
                {options.map((option) => (
                  <label className="option" key={option.key}>
                    <input
                      defaultChecked={currentRecord?.userAnswer.includes(option.key) ?? false}
                      type={question.type === 'MULTI' ? 'checkbox' : 'radio'}
                      name="answer"
                      value={option.key}
                      required={question.type !== 'MULTI'}
                    />
                    <strong>{option.key}</strong>
                    <span>{option.text}</span>
                  </label>
                ))}
                <button type="submit" className="primary">
                  <Send size={17} aria-hidden="true" />
                  {currentRecord && attempt.mode === 'MOCK' ? '更新答案' : '提交答案'}
                </button>
              </form>
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
