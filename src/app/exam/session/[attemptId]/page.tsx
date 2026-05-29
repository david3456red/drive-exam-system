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
  submitAnswerAction,
} from '@/app/exam/actions';
import { prisma } from '@/lib/db';
import {
  EXAM_MODE_LABEL,
  QUESTION_TYPE_LABEL,
  parseQuestionOptions,
} from '@/lib/display';
import { parseOrder } from '@/lib/exam-engine/snapshot';
import { requireUser } from '@/lib/server-session';
import { MockEffects } from './mock-effects';
import { QuestionImage } from './question-image';

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

  const questionId = order[Math.min(attempt.currentIndex, order.length - 1)];
  const question = questionId
    ? await prisma.question.findUnique({ where: { id: questionId } })
    : null;
  if (!question) notFound();

  const options = parseQuestionOptions(question.options);
  const feedback = searchParams?.feedback
    ? await prisma.examRecord.findFirst({
        where: { attemptId: attempt.id, questionId: searchParams.feedback },
        include: { question: true },
      })
    : null;
  const feedbackOptions = feedback
    ? parseQuestionOptions(feedback.question.options)
    : [];

  return (
    <main className="page stack">
      <div className="cluster">
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
          第 {Math.min(attempt.currentIndex + 1, order.length)} / {order.length} 题
        </span>
        {attempt.mode === 'MOCK' && attempt.expiresAt ? (
          <MockEffects attemptId={attempt.id} expiresAt={attempt.expiresAt.toISOString()} />
        ) : null}
      </div>

      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}

      {feedback && attempt.mode !== 'MOCK' ? (
        <section className={`panel stack ${feedback.isCorrect ? '' : ''}`}>
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
        </div>
        <h1>{question.content}</h1>
        {question.imageUrl ? <QuestionImage src={question.imageUrl} /> : null}
        <form action={submitAnswerAction} className="stack">
          <input type="hidden" name="attemptId" value={attempt.id} />
          <input type="hidden" name="questionId" value={question.id} />
          <input type="hidden" name="costMs" value="0" />
          {options.map((option) => (
            <label className="option" key={option.key}>
              <input
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
            提交答案
          </button>
        </form>
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
    </main>
  );
}
