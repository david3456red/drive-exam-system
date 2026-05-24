/**
 * 答题模式 (Exam Modes) - 答题主界面 Server Component
 *
 * 路由:`/exam/session/[attemptId]`
 *
 * 本页负责"数据加载与归属/状态门禁",并按 `attempt.mode` 分派到对应的
 * 客户端 Player 组件:
 *
 * - SEQUENTIAL / CHAPTER / WRONG_REVIEW → `PracticePlayer`(本任务 16.3 接入)
 * - RANDOM                              → 占位,待任务 16.4 实现 `RandomPlayer`
 * - MOCK                                → 占位,待任务 16.5 实现 `MockPlayer`
 *
 * 数据流:
 *
 * 1. 通过 `auth()` 拿到当前 `userId`。
 * 2. 按 `attemptId` 读取 `ExamAttempt`,做归属校验:不存在或不属于当前用户
 *    一律 `notFound()`,避免越权访问(对应设计文档 §Error Handling)。
 * 3. 若状态非 `ONGOING`(已 FINISHED / ABANDONED),则跳转到结果页,让用户
 *    继续看到统计数据,而不是回到答题界面。
 * 4. 解析 `questionOrder` 快照拿到题目 ID 数组;若为空则提示用户放弃后重开
 *    (灰度老数据兜底,对应设计文档 §Data Models 的迁移说明)。
 * 5. 一次性 `findMany` 加载所有题目正文与选项,再按 `questionOrder` 顺序
 *    重排成 `ordered` 数组,保证客户端拿到的题目顺序与会话快照一致。
 * 6. 加载已有 `ExamRecord` 用于 PracticePlayer 的"上一题"回看(模考与随机
 *    模式不显示反馈,但仍可读到记录用于"已答题"标记)。
 */
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { parseOrder } from '@/lib/exam-engine/snapshot';
import type { ExamMode } from '@/lib/exam-engine/types';
import { parseOptions } from '@/lib/question-types';

import { MockPlayer } from './_components/mock-player';
import { PracticePlayer } from './_components/practice-player';
import { RandomPlayer } from './_components/random-player';

export default async function ExamSessionPage(props: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await props.params;
  const session = await auth();
  const userId = session!.user.id;

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      mode: true,
      status: true,
      questionOrder: true,
      currentIndex: true,
      expiresAt: true,
      startedAt: true,
      bankId: true,
    },
  });

  // 归属校验:不存在或不属于当前用户 → 一律 404,避免越权探测
  if (!attempt || attempt.userId !== userId) {
    notFound();
  }

  // 已结束(FINISHED / ABANDONED) → 跳到结果页继续看统计数据
  if (attempt.status !== 'ONGOING') {
    redirect(`/exam/session/${attemptId}/result`);
  }

  // 加载题目快照(按 questionOrder 顺序)
  const questionIds = parseOrder(attempt.questionOrder);
  if (questionIds.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        会话题目数据缺失,请
        <a href="/exam" className="text-blue-600 underline">
          放弃后重新开始
        </a>
        。
      </div>
    );
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      type: true,
      content: true,
      imageUrl: true,
      options: true,
    },
  });

  // findMany 不保证顺序,这里按 questionIds 的顺序重排,使客户端渲染顺序
  // 与快照一致;对题库被删题等异常情况用 filter 兜底丢弃 undefined。
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ordered = questionIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({
      id: q.id,
      type: q.type,
      content: q.content,
      imageUrl: q.imageUrl,
      options: parseOptions(q.options),
    }));

  // 已有答题记录,用于 PracticePlayer "上一题"回看与"已答"标记
  const records = await prisma.examRecord.findMany({
    where: { attemptId },
    select: { questionId: true, userAnswer: true, isCorrect: true },
  });

  const mode = attempt.mode as ExamMode;

  // 按模式分派 Player。
  if (mode === 'SEQUENTIAL' || mode === 'CHAPTER' || mode === 'WRONG_REVIEW') {
    return (
      <PracticePlayer
        attemptId={attempt.id}
        mode={mode}
        questions={ordered}
        initialIndex={attempt.currentIndex}
        initialRecords={records}
      />
    );
  }

  if (mode === 'RANDOM') {
    return (
      <RandomPlayer
        attemptId={attempt.id}
        questions={ordered}
        initialIndex={attempt.currentIndex}
        initialRecords={records}
      />
    );
  }

  if (mode === 'MOCK') {
    // MOCK 模式必有 expiresAt;若数据异常缺失则提示用户。
    if (!attempt.expiresAt) {
      return (
        <div className="text-center text-gray-500 py-8">
          模考会话数据异常,请
          <a href="/exam" className="text-blue-600 underline">
            返回首页
          </a>
          重新开始。
        </div>
      );
    }
    return (
      <MockPlayer
        attemptId={attempt.id}
        questions={ordered}
        initialIndex={attempt.currentIndex}
        initialRecords={records.map((r) => ({
          questionId: r.questionId,
          userAnswer: r.userAnswer,
        }))}
        expiresAt={attempt.expiresAt}
      />
    );
  }

  // 兜底:未知模式
  return (
    <div className="text-center text-gray-500 py-8">
      未知的答题模式:{mode}
    </div>
  );
}
