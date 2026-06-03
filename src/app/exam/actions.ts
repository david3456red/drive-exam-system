'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { EXAM_MODES, type ExamMode, type ExamStatus, type QuestionType } from '@/lib/enums';
import { compareAnswer, normalizeAnswer, clampCostMs } from '@/lib/exam-engine/judger';
import { loadQuestionsForMode } from '@/lib/exam-engine/question-loader';
import { applyExamResult } from '@/lib/exam-engine/wrongbook';
import { getMockConfig } from '@/lib/exam-engine/mock-config';
import { resolveSubmittedQuestion } from '@/lib/exam-engine/submission-guard';
import { parseOrder, serializeCategoryIds, serializeOrder } from '@/lib/exam-engine/snapshot';
import { hasPermission } from '@/lib/permissions';
import { requireUser } from '@/lib/server-session';

export async function startSessionAction(formData: FormData): Promise<void> {
  const user = requireUser();
  const mode = String(formData.get('mode') ?? '') as ExamMode;
  const bankId = String(formData.get('bankId') ?? '');
  const categoryIds = formData
    .getAll('categoryIds')
    .map(String)
    .filter(Boolean);

  if (!EXAM_MODES.includes(mode)) redirect('/exam?error=未知练习模式');
  if (mode !== 'WRONG_REVIEW' && !bankId) redirect('/exam?error=请选择题库');
  if (mode === 'CHAPTER' && categoryIds.length === 0) {
    redirect('/exam?error=章节练习至少选择一个分类');
  }

  const permission = mode === 'MOCK' ? 'exam:mock' : 'exam:practice';
  if (!hasPermission({ user }, permission)) redirect('/exam?error=没有练习权限');

  const existing = await prisma.examAttempt.findFirst({
    where: {
      userId: user.id,
      mode,
      status: 'ONGOING',
      bankId: mode === 'WRONG_REVIEW' ? null : bankId,
    },
    select: { id: true },
  });
  if (existing) redirect(`/exam/session/${existing.id}`);

  const bank =
    mode === 'WRONG_REVIEW'
      ? null
      : await prisma.questionBank.findUnique({ where: { id: bankId } });
  if (mode !== 'WRONG_REVIEW' && !bank) redirect('/exam?error=题库不存在');

  const loadResult = await loadQuestionsForMode(
    prisma,
    mode === 'WRONG_REVIEW'
      ? { mode, userId: user.id }
      : mode === 'CHAPTER'
        ? { mode, bankId, categoryIds }
        : mode === 'MOCK'
          ? { mode, bankId, bankCode: bank!.code }
          : { mode, bankId },
  );

  if (!loadResult.ok) {
    redirect(`/exam?error=${encodeURIComponent(loadErrorText(loadResult.error))}`);
  }

  const now = new Date();
  const expiresAt =
    mode === 'MOCK'
      ? new Date(now.getTime() + getMockConfig(bank!.code).durationMs)
      : null;

  const attempt = await prisma.examAttempt.create({
    data: {
      userId: user.id,
      bankId: mode === 'WRONG_REVIEW' ? null : bankId,
      mode,
      status: 'ONGOING',
      questionOrder: serializeOrder(loadResult.questionIds),
      currentIndex: 0,
      categoryIds: mode === 'CHAPTER' ? serializeCategoryIds(categoryIds) : '[]',
      expiresAt,
    },
    select: { id: true },
  });

  revalidatePath('/exam');
  redirect(`/exam/session/${attempt.id}`);
}

export async function submitAnswerAction(formData: FormData): Promise<void> {
  const user = requireUser();
  const attemptId = String(formData.get('attemptId') ?? '');
  const questionId = String(formData.get('questionId') ?? '');
  const rawAnswers = formData.getAll('answer').map(String);
  const userAnswer = rawAnswers.join('');
  const costMs = Number(formData.get('costMs') ?? 0);

  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId: user.id },
  });
  if (!attempt || attempt.status !== 'ONGOING') redirect('/exam');

  if (attempt.mode === 'MOCK' && attempt.expiresAt && attempt.expiresAt < new Date()) {
    await finalizeAttempt(attempt.id, user.id, 'ABANDONED');
    redirect(`/exam/session/${attempt.id}/result`);
  }

  const order = parseOrder(attempt.questionOrder);
  const submittedQuestion = resolveSubmittedQuestion(order, questionId);
  if (!submittedQuestion.ok) {
    redirect(`/exam/session/${attempt.id}?error=题目不属于本次会话`);
  }

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) redirect(`/exam/session/${attempt.id}`);

  const existingRecord = await prisma.examRecord.findFirst({
    where: { attemptId: attempt.id, questionId },
    select: { id: true },
  });
  if (existingRecord && attempt.mode !== 'MOCK') {
    redirect(`/exam/session/${attempt.id}?error=${encodeURIComponent('该题已判题，不能修改')}`);
  }

  const questionType = question.type as QuestionType;
  const normalized = normalizeAnswer(questionType, userAnswer);
  const isCorrect = compareAnswer(questionType, normalized, question.answer);
  const now = new Date();
  let nextCurrentIndex = submittedQuestion.index;

  await prisma.$transaction(async (tx) => {
    if (attempt.mode === 'MOCK' && existingRecord) {
      await tx.examRecord.update({
        where: { id: existingRecord.id },
        data: {
          userAnswer: normalized,
          isCorrect,
          costMs: clampCostMs(costMs),
        },
      });
    } else {
      await tx.examRecord.create({
        data: {
          attemptId: attempt.id,
          questionId,
          userAnswer: normalized,
          isCorrect,
          costMs: clampCostMs(costMs),
        },
      });
    }

    if (attempt.mode !== 'MOCK') {
      const prev = await tx.wrongQuestion.findUnique({
        where: { userId_questionId: { userId: user.id, questionId } },
      });
      const next = applyExamResult(prev, isCorrect, now);
      if (next) {
        await tx.wrongQuestion.upsert({
          where: { userId_questionId: { userId: user.id, questionId } },
          update: {
            wrongCount: next.wrongCount,
            rightCount: next.rightCount,
            mastered: next.mastered,
            lastWrongAt: next.lastWrongAt,
          },
          create: {
            userId: user.id,
            questionId,
            wrongCount: next.wrongCount,
            rightCount: next.rightCount,
            mastered: next.mastered,
            lastWrongAt: next.lastWrongAt,
          },
        });
      }
    }

    const answered = await tx.examRecord.findMany({
      where: { attemptId: attempt.id },
      select: { questionId: true },
    });
    nextCurrentIndex = findNextUnansweredIndex(
      order,
      answered.map((record) => record.questionId),
      submittedQuestion.index,
    );
    await tx.examAttempt.update({
      where: { id: attempt.id },
      data: { currentIndex: nextCurrentIndex },
    });
  });

  const feedback =
    attempt.mode === 'MOCK' ? '' : `?feedback=${encodeURIComponent(questionId)}`;
  redirect(`/exam/session/${attempt.id}${feedback}`);
}

export async function goToQuestionAction(formData: FormData): Promise<void> {
  const user = requireUser();
  const attemptId = String(formData.get('attemptId') ?? '');
  const questionId = String(formData.get('questionId') ?? '');

  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId: user.id },
  });
  if (!attempt || attempt.status !== 'ONGOING') redirect('/exam');

  const order = parseOrder(attempt.questionOrder);
  const targetQuestion = resolveSubmittedQuestion(order, questionId);
  if (!targetQuestion.ok) {
    redirect(`/exam/session/${attempt.id}?error=${encodeURIComponent('题目不属于本次会话')}`);
  }

  await prisma.examAttempt.update({
    where: { id: attempt.id },
    data: { currentIndex: targetQuestion.index },
  });

  redirect(`/exam/session/${attempt.id}`);
}

export async function finishAttemptAction(formData: FormData): Promise<void> {
  const user = requireUser();
  const attemptId = String(formData.get('attemptId') ?? '');
  await finalizeAttempt(attemptId, user.id, 'FINISHED');
  redirect(`/exam/session/${attemptId}/result`);
}

export async function abandonAttemptAction(formData: FormData): Promise<void> {
  const user = requireUser();
  const attemptId = String(formData.get('attemptId') ?? '');
  await finalizeAttempt(attemptId, user.id, 'ABANDONED');
  redirect('/exam');
}

export async function toggleMasteredAction(formData: FormData): Promise<void> {
  const user = requireUser('wrong:manage');
  const wrongId = String(formData.get('wrongId') ?? '');
  const mastered = String(formData.get('mastered') ?? '') === 'true';

  const wrong = await prisma.wrongQuestion.findFirst({
    where: { id: wrongId, userId: user.id },
  });
  if (!wrong) redirect('/exam/wrong?error=无权操作');

  await prisma.wrongQuestion.update({
    where: { id: wrong.id },
    data: { mastered, rightCount: mastered ? wrong.rightCount : 0 },
  });
  revalidatePath('/exam/wrong');
  redirect('/exam/wrong');
}

export async function adoptExpiredMockForCurrentUser(): Promise<void> {
  const user = requireUser();
  const expired = await prisma.examAttempt.findMany({
    where: {
      userId: user.id,
      mode: 'MOCK',
      status: 'ONGOING',
      expiresAt: { lt: new Date(Date.now() - 60_000) },
    },
    select: { id: true },
  });
  for (const attempt of expired) {
    await finalizeAttempt(attempt.id, user.id, 'ABANDONED');
  }
}

export async function finalizeAttempt(
  attemptId: string,
  userId: string,
  finalStatus: Exclude<ExamStatus, 'ONGOING'>,
): Promise<void> {
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId },
  });
  if (!attempt || attempt.status !== 'ONGOING') return;

  const finishedAt = new Date();
  const order = parseOrder(attempt.questionOrder);

  await prisma.$transaction(async (tx) => {
    if (attempt.mode === 'MOCK') {
      const existing = await tx.examRecord.findMany({
        where: { attemptId },
        select: { questionId: true },
      });
      const existingIds = new Set(existing.map((r) => r.questionId));
      const missing = order.filter((questionId) => !existingIds.has(questionId));
      if (missing.length > 0) {
        await tx.examRecord.createMany({
          data: missing.map((questionId) => ({
            attemptId,
            questionId,
            userAnswer: '',
            isCorrect: false,
            costMs: 0,
          })),
        });
      }

      const finalRecords = await tx.examRecord.findMany({
        where: { attemptId, questionId: { in: order } },
        select: { questionId: true, isCorrect: true },
      });
      for (const record of finalRecords) {
        const prev = await tx.wrongQuestion.findUnique({
          where: { userId_questionId: { userId, questionId: record.questionId } },
        });
        const next = applyExamResult(prev, record.isCorrect, finishedAt);
        if (next) {
          await tx.wrongQuestion.upsert({
            where: { userId_questionId: { userId, questionId: record.questionId } },
            update: {
              wrongCount: next.wrongCount,
              rightCount: next.rightCount,
              mastered: next.mastered,
              lastWrongAt: next.lastWrongAt,
            },
            create: {
              userId,
              questionId: record.questionId,
              wrongCount: next.wrongCount,
              rightCount: next.rightCount,
              mastered: next.mastered,
              lastWrongAt: next.lastWrongAt,
            },
          });
        }
      }
    }

    const totalCount = order.length;
    const correctCount = await tx.examRecord.count({
      where: { attemptId, isCorrect: true, questionId: { in: order } },
    });
    const score = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);

    await tx.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: finalStatus,
        finishedAt,
        totalCount,
        correctCount,
        score,
        durationMs: Math.max(0, finishedAt.getTime() - attempt.startedAt.getTime()),
      },
    });
  });

  revalidatePath('/exam');
  revalidatePath('/exam/history');
  revalidatePath('/exam/wrong');
}

function findNextUnansweredIndex(
  order: string[],
  answeredQuestionIds: string[],
  submittedIndex: number,
): number {
  if (order.length === 0) return 0;
  const answered = new Set(answeredQuestionIds);
  const start = Math.min(Math.max(submittedIndex, 0), order.length - 1);

  for (let offset = 1; offset <= order.length; offset += 1) {
    const index = (start + offset) % order.length;
    const questionId = order[index];
    if (questionId && !answered.has(questionId)) {
      return index;
    }
  }

  return start;
}

function loadErrorText(error: string): string {
  switch (error) {
    case 'BANK_EMPTY':
      return '该题库暂无题目';
    case 'CHAPTER_EMPTY':
      return '所选章节下暂无匹配题目';
    case 'INSUFFICIENT_QUESTIONS':
      return '题库题目不足，无法开始模拟考试';
    case 'NO_WRONG_QUESTIONS':
      return '暂无需要重做的错题';
    default:
      return '无法开始练习';
  }
}
