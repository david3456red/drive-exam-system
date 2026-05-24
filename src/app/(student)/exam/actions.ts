'use server';

/**
 * 答题模式 (Exam Modes) - 学员侧 Server Actions
 *
 * 本文件集中暴露答题流程所需的 Server Actions。当前实现:
 *
 * - `startSession`:按模式创建新的 `ExamAttempt` 会话,或在已有 `ONGOING`
 *   会话时直接复用。负责权限校验、入参 zod 校验、调度 `loadQuestionsForMode`
 *   构造题目快照,并把结果写入 `ExamAttempt.questionOrder` / `categoryIds` /
 *   `expiresAt` 等字段。
 *
 * 后续任务会在本文件追加 `resumeSession` / `submitAnswer` / `finishSession` /
 * `abandonSession` / `toggleMastered` 等动作,因此本文件保持开放性,不使用
 * `export default`。
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { clampCostMs, compareAnswer, normalizeAnswer } from '@/lib/exam-engine/judger';
import { loadQuestionsForMode } from '@/lib/exam-engine/question-loader';
import {
    parseOrder,
    serializeCategoryIds,
    serializeOrder,
} from '@/lib/exam-engine/snapshot';
import { type ActionResult, getMockConfig } from '@/lib/exam-engine/types';
import { applyExamResult } from '@/lib/exam-engine/wrongbook';
import { hasPermission } from '@/lib/permissions';
import type { QuestionType } from '@/lib/question-types';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

/**
 * 校验当前请求是否具有指定权限点。沿用 `banks/actions.ts` 的写法,
 * 失败时返回结构化的 `ActionResult` 失败值,成功时把已认证 `user` 传出。
 */
async function requirePerm(code: string) {
  const session = await auth();
  if (!hasPermission(session?.user, code)) {
    return { ok: false as const, error: '无权限' };
  }
  return { ok: true as const, user: session!.user };
}

/**
 * `startSession` 入参的 discriminated union schema。
 * - `SEQUENTIAL` / `RANDOM` / `MOCK`:仅需 `bankId`
 * - `CHAPTER`:需要非空的 `categoryIds`
 * - `WRONG_REVIEW`:不需要任何额外字段(从当前用户错题本加载)
 */
const StartSessionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('SEQUENTIAL'), bankId: z.string().min(1) }),
  z.object({ mode: z.literal('RANDOM'), bankId: z.string().min(1) }),
  z.object({
    mode: z.literal('CHAPTER'),
    bankId: z.string().min(1),
    categoryIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({ mode: z.literal('MOCK'), bankId: z.string().min(1) }),
  z.object({ mode: z.literal('WRONG_REVIEW') }),
]);

export type StartSessionInput = z.infer<typeof StartSessionSchema>;

/**
 * 开启一个新的答题会话,或在已有 `ONGOING` 会话时返回该会话(断点续答)。
 *
 * 流程:
 * 1. 权限校验:`MOCK` 模式需 `exam:mock`,其它模式需 `exam:practice`。
 * 2. zod 校验入参,失败返回 `提交不合法`。
 * 3. 在创建新会话前先查询同 `(userId, mode[, bankId])` 是否已有 `ONGOING`
 *    会话(对应需求 1.8);若有则原样返回 `attemptId`,`resumed = true`。
 * 4. 调用 `loadQuestionsForMode` 构造题目快照;失败按原因映射中文提示。
 * 5. 创建 `ExamAttempt`,写入 `questionOrder` / `categoryIds` / `expiresAt`
 *    与 `totalCount`(总题数,结束时再依实际答题数刷新)。
 * 6. `revalidatePath('/exam')` 让模式选择页拿到最新的"继续上次"状态。
 */
export async function startSession(
  input: StartSessionInput,
): Promise<ActionResult<{ attemptId: string; resumed: boolean }>> {
  // 1. 权限:模考额外需要 exam:mock,否则只需 exam:practice。
  //    先用 zod parse 才能安全访问 input.mode,这里采取"先粗判 mode 字段"
  //    的方式即可——zod 校验仍会在后面兜底。
  const permCode = (input as { mode?: string })?.mode === 'MOCK' ? 'exam:mock' : 'exam:practice';
  const authed = await requirePerm(permCode);
  if (!authed.ok) return authed;

  // 2. 入参校验
  const parsed = StartSessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '提交不合法' };
  }
  const data = parsed.data;
  const userId = authed.user.id;

  // 3. 复用已有 ONGOING 会话(需求 1.8)
  const existing = await prisma.examAttempt.findFirst({
    where: {
      userId,
      mode: data.mode,
      status: 'ONGOING',
      ...(data.mode === 'WRONG_REVIEW' ? {} : { bankId: data.bankId }),
    },
    select: { id: true },
  });
  if (existing) {
    return { ok: true, data: { attemptId: existing.id, resumed: true } };
  }

  // 4. 构造题目快照
  const loadInput =
    data.mode === 'WRONG_REVIEW'
      ? ({ mode: 'WRONG_REVIEW', userId } as const)
      : data;
  const result = await loadQuestionsForMode(prisma, loadInput);
  if (!result.ok) {
    switch (result.reason) {
      case 'EMPTY_BANK':
        return { ok: false, error: '该题库暂无题目' };
      case 'EMPTY_CATEGORY':
        return { ok: false, error: '所选章节下暂无题目' };
      case 'EMPTY_WRONG':
        return { ok: false, error: '暂无需要重做的错题' };
      case 'INSUFFICIENT_FOR_MOCK':
        return { ok: false, error: '题库题目不足,无法开始模拟考试' };
    }
  }

  // 5. 写入 ExamAttempt
  // `getMockConfig` 在此尚未直接使用,但保留导入以便后续 Action(如
  // `finishSession` 计算通过线)复用。模考的 `expiresAt` 已经由
  // `loadQuestionsForMode` 计算并通过 `result.expiresAt` 传出。
  void getMockConfig;

  const attempt = await prisma.examAttempt.create({
    data: {
      userId,
      bankId: data.mode === 'WRONG_REVIEW' ? null : data.bankId,
      mode: data.mode,
      status: 'ONGOING',
      questionOrder: serializeOrder(result.questionIds),
      currentIndex: 0,
      categoryIds:
        data.mode === 'CHAPTER' ? serializeCategoryIds(data.categoryIds) : '[]',
      expiresAt: result.expiresAt ?? null,
      // 先记录题目快照大小作为总题数;会话结束时根据实际 ExamRecord 数量刷新。
      totalCount: result.questionIds.length,
    },
    select: { id: true },
  });

  revalidatePath('/exam');
  return { ok: true, data: { attemptId: attempt.id, resumed: false } };
}

/**
 * 显式"继续上次"按钮使用的轻量 Server Action。
 *
 * 实际"断点续答"的题目数据由 `/exam/session/[attemptId]` Server Component
 * 直接读取数据库渲染,本 Action 仅用于在跳转之前确认会话仍然属于当前用户
 * 且处于 `ONGOING` 状态,提早把"会话已结束 / 不存在"的错误以 toast 形式
 * 呈现给用户,避免进入会话页才发现 404。
 *
 * 流程:
 * 1. 仅校验 `exam:practice` 权限——这是普通练习权限即可,
 *    模考会话也由学员自身访问,所以不需要额外的 `exam:mock`。
 * 2. 按 `(attemptId, userId)` 双条件查询 `ExamAttempt`,确保只能"继续"
 *    自己的会话(对应 Error Handling 中的"会话存在性与归属")。
 * 3. 命中后再校验 `status === 'ONGOING'`;`FINISHED` / `ABANDONED`
 *    的会话不能再继续答题。
 *
 * @param attemptId 目标 ExamAttempt 的 id
 */
export async function resumeSession(attemptId: string): Promise<ActionResult> {
  const authed = await requirePerm('exam:practice');
  if (!authed.ok) return authed;

  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId: authed.user.id },
    select: { status: true },
  });
  if (!attempt) {
    return { ok: false, error: '会话不存在或无权访问' };
  }
  if (attempt.status !== 'ONGOING') {
    return { ok: false, error: '会话已结束,无法继续' };
  }
  return { ok: true };
}

/**
 * `submitAnswer` 的 zod schema:
 * - `attemptId` / `questionId`:非空字符串;
 * - `userAnswer`:允许空串(用于 MOCK 超时占位与"全不选"的非法提交,
 *   非法值由后续判分路径处理,不在 schema 拒绝);
 * - `costMs`:数值,后续由 `clampCostMs` 钳制到 `[0, 3_600_000]`,
 *   因此这里不再做范围限制。
 */
const SubmitAnswerSchema = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  userAnswer: z.string(),
  costMs: z.number(),
});

export type SubmitAnswerInput = z.infer<typeof SubmitAnswerSchema>;

/**
 * 提交单道题的答案。
 *
 * 流程(全部包裹在 `prisma.$transaction` 中以避免并发提交导致重复 ExamRecord
 * 或错题本状态错乱):
 *
 * 1. 校验 `exam:practice` 权限(模考会话也由学员本人提交,沿用同一权限点)。
 * 2. zod 校验入参。
 * 3. 查询 `ExamAttempt`,确认存在、属于当前用户且仍处于 `ONGOING`;
 *    若是 MOCK 且 `now > expiresAt` 则简单将状态置为 `FINISHED`(完整的
 *    成绩补齐由任务 11.1 的 `finalizeAttempt` 实现)并拒绝当前提交。
 * 4. 校验 `questionId` 出现在 `questionOrder` 快照中(防止学员篡改前端
 *    传入跨会话题目)。
 * 5. 同会话同题目幂等:已存在 `ExamRecord(attemptId, questionId)` 时直接返回
 *    错误,不修改任何数据(对应 Property 9 / 需求 7.8)。
 * 6. 用 `compareAnswer` 判定对错,`normalizeAnswer` 规范化用户答案,
 *    `clampCostMs` 钳制耗时,然后写入 `ExamRecord`。
 * 7. 用 `applyExamResult` 计算错题本下一状态:
 *    - 返回 `null`(题目不在错题本中且本次答对):不操作;
 *    - 旧条目为 `null`:`create` 新错题本条目;
 *    - 旧条目存在:`update` 现有条目。
 *    `WrongQuestion` 上有 `@@unique([userId, questionId])`,因此用
 *    `findUnique({ where: { userId_questionId } })` 即可。
 * 8. 推进 `currentIndex = max(prev, indexOf(questionId) + 1)`,
 *    `finished = nextIndex >= questionOrder.length`。
 * 9. 返回结果:
 *    - 模考模式下不暴露正确答案与解析(对应需求 7.4 / 5.5);
 *    - 其它模式正常返回正确答案与解析,供 UI 立即反馈。
 *
 * 注意:本 Action 只负责"答完最后一题时通过 `finished` 通知前端",并不会在
 * 这里直接把 `ExamAttempt.status` 转为 `FINISHED`。会话最终结束由任务 11.1
 * 的 `finishSession` 在拿到 `finished=true` 后调用,以便统一计算分数与时长。
 */
export async function submitAnswer(input: SubmitAnswerInput): Promise<
  ActionResult<{
    isCorrect: boolean;
    correctAnswer?: string;
    explanation?: string | null;
    finished: boolean;
  }>
> {
  // 1. 权限
  const authed = await requirePerm('exam:practice');
  if (!authed.ok) return authed;

  // 2. 入参校验
  const parsed = SubmitAnswerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '提交不合法' };
  }
  const { attemptId, questionId, userAnswer, costMs } = parsed.data;
  const userId = authed.user.id;

  // 3-8. 事务:读会话 + 幂等检查 + 写记录 + upsert 错题本 + 推进进度
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        status: true,
        mode: true,
        expiresAt: true,
        questionOrder: true,
        currentIndex: true,
      },
    });
    if (!attempt || attempt.userId !== userId) {
      return { ok: false as const, error: '会话不存在或无权访问' };
    }
    if (attempt.status !== 'ONGOING') {
      return { ok: false as const, error: '会话已结束,无法继续提交' };
    }

    // MOCK 过期:做最小化处理(置 FINISHED 阻止后续提交);完整的成绩补齐
    // 由任务 11.1 实现的 finalizeAttempt 负责。
    const now = new Date();
    if (
      attempt.mode === 'MOCK' &&
      attempt.expiresAt &&
      now.getTime() > attempt.expiresAt.getTime()
    ) {
      await tx.examAttempt.update({
        where: { id: attemptId },
        data: { status: 'FINISHED', finishedAt: now },
      });
      return { ok: false as const, error: '考试时间已结束' };
    }

    // 4. 题目必须在 questionOrder 快照内
    const order = parseOrder(attempt.questionOrder);
    const indexInOrder = order.indexOf(questionId);
    if (indexInOrder < 0) {
      return { ok: false as const, error: '该题目不属于当前会话' };
    }

    // 5. 同题幂等:已存在 ExamRecord 直接拒绝
    const existingRecord = await tx.examRecord.findFirst({
      where: { attemptId, questionId },
      select: { id: true },
    });
    if (existingRecord) {
      return { ok: false as const, error: '该题已提交' };
    }

    // 6. 查题目正文并判分
    const question = await tx.question.findUnique({
      where: { id: questionId },
      select: { id: true, type: true, answer: true, explanation: true },
    });
    if (!question) {
      return { ok: false as const, error: '题目已被删除' };
    }

    const qType = question.type as QuestionType;
    const normalizedUserAnswer = normalizeAnswer(qType, userAnswer);
    const isCorrect = compareAnswer(qType, userAnswer, question.answer);
    const clampedCostMs = clampCostMs(costMs);

    // 7. 写 ExamRecord
    await tx.examRecord.create({
      data: {
        attemptId,
        questionId,
        userAnswer: normalizedUserAnswer,
        isCorrect,
        costMs: clampedCostMs,
      },
    });

    // 8. 维护错题本
    const prevWrong = await tx.wrongQuestion.findUnique({
      where: { userId_questionId: { userId, questionId } },
      select: { wrongCount: true, rightCount: true, mastered: true, lastWrongAt: true },
    });
    const nextWrong = applyExamResult(prevWrong, isCorrect, now);
    if (nextWrong !== null) {
      if (prevWrong === null) {
        await tx.wrongQuestion.create({
          data: {
            userId,
            questionId,
            wrongCount: nextWrong.wrongCount,
            rightCount: nextWrong.rightCount,
            mastered: nextWrong.mastered,
            lastWrongAt: nextWrong.lastWrongAt,
          },
        });
      } else {
        await tx.wrongQuestion.update({
          where: { userId_questionId: { userId, questionId } },
          data: {
            wrongCount: nextWrong.wrongCount,
            rightCount: nextWrong.rightCount,
            mastered: nextWrong.mastered,
            lastWrongAt: nextWrong.lastWrongAt,
          },
        });
      }
    }

    // 9. 推进 currentIndex
    const nextIndex = Math.max(attempt.currentIndex, indexInOrder + 1);
    const finished = nextIndex >= order.length;
    if (nextIndex !== attempt.currentIndex) {
      await tx.examAttempt.update({
        where: { id: attemptId },
        data: { currentIndex: nextIndex },
      });
    }

    // 10. 模考不暴露正确答案与解析,其它模式立即反馈
    if (attempt.mode === 'MOCK') {
      return {
        ok: true as const,
        data: { isCorrect, finished },
      };
    }
    return {
      ok: true as const,
      data: {
        isCorrect,
        correctAnswer: question.answer,
        explanation: question.explanation,
        finished,
      },
    };
  });
}


// ---------------------------------------------------------------------------
// 11.1 finishSession + 内部 helper finalizeAttempt
// ---------------------------------------------------------------------------

/**
 * @internal
 *
 * 在事务中把一个 `ONGOING` 的 `ExamAttempt` 结算为最终状态(`FINISHED` 或
 * `ABANDONED`)。本函数是 `finishSession` / `abandonSession` /
 * `adoptExpiredMock`(任务 11.2 / 11.3 复用)的核心逻辑,因此故意不导出,
 * 仅供本文件内的公共 Action 调用。
 *
 * 行为契约(对应设计文档 Property 10):
 *
 * 1. **幂等**:若 attempt 已经处于 `FINISHED` / `ABANDONED`,直接返回,
 *    不做任何写操作。
 * 2. **MOCK 补齐**:对 `MOCK` 模式,读取 `questionOrder` 与已存在的
 *    `ExamRecord`,为快照中尚未答题的每一道题补建一条空记录
 *    (`userAnswer=''`、`isCorrect=false`、`costMs=0`)。同时按"答错"
 *    路径调用 `applyExamResult` 维护错题本——这与设计文档
 *    "MOCK 超时未答 = 答错"语义保持一致。
 * 3. **统计字段计算**:
 *    - `totalCount = ExamRecord.count({ attemptId })`
 *    - `correctCount = ExamRecord.count({ attemptId, isCorrect: true })`
 *    - `score = totalCount === 0 ? 0 : Math.round(correctCount / totalCount * 100)`
 *    - `finishedAt = new Date()`
 *    - `durationMs = finishedAt - startedAt`(若 `finishedAt < startedAt`
 *      则钳到 0,理论上不会发生)
 * 4. **写回 ExamAttempt**:`status = finalStatus` 与上述字段一并 update。
 *
 * 类型注解上使用 `Prisma.TransactionClient`,这是
 * `prisma.$transaction(async tx => ...)` 回调中 `tx` 的精确类型,
 * 与项目其它使用模式一致。
 *
 * @param tx          Prisma 事务客户端
 * @param attemptId   目标 ExamAttempt id
 * @param finalStatus 最终状态:`FINISHED`(用户主动结束 / 模考自然结束)
 *                    或 `ABANDONED`(用户放弃 / 模考超时兜底)
 */
async function finalizeAttempt(
  tx: Prisma.TransactionClient,
  attemptId: string,
  finalStatus: 'FINISHED' | 'ABANDONED',
): Promise<void> {
  // 1. 读 attempt
  const attempt = await tx.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      mode: true,
      status: true,
      startedAt: true,
      questionOrder: true,
    },
  });
  if (!attempt) return;

  // 2. 幂等:已结束不再处理
  if (attempt.status === 'FINISHED' || attempt.status === 'ABANDONED') {
    return;
  }

  const finishedAt = new Date();

  // 3. MOCK 模式补齐空 ExamRecord
  if (attempt.mode === 'MOCK') {
    const order = parseOrder(attempt.questionOrder);
    if (order.length > 0) {
      const existing = await tx.examRecord.findMany({
        where: { attemptId },
        select: { questionId: true },
      });
      const answeredSet = new Set(existing.map((r) => r.questionId));
      const missingIds = order.filter((qid) => !answeredSet.has(qid));

      for (const questionId of missingIds) {
        // 3a. 写空 ExamRecord
        await tx.examRecord.create({
          data: {
            attemptId,
            questionId,
            userAnswer: '',
            isCorrect: false,
            costMs: 0,
          },
        });

        // 3b. 错题本:按"答错"路径维护
        const prevWrong = await tx.wrongQuestion.findUnique({
          where: {
            userId_questionId: { userId: attempt.userId, questionId },
          },
          select: {
            wrongCount: true,
            rightCount: true,
            mastered: true,
            lastWrongAt: true,
          },
        });
        const nextWrong = applyExamResult(prevWrong, false, finishedAt);
        if (nextWrong !== null) {
          if (prevWrong === null) {
            await tx.wrongQuestion.create({
              data: {
                userId: attempt.userId,
                questionId,
                wrongCount: nextWrong.wrongCount,
                rightCount: nextWrong.rightCount,
                mastered: nextWrong.mastered,
                lastWrongAt: nextWrong.lastWrongAt,
              },
            });
          } else {
            await tx.wrongQuestion.update({
              where: {
                userId_questionId: { userId: attempt.userId, questionId },
              },
              data: {
                wrongCount: nextWrong.wrongCount,
                rightCount: nextWrong.rightCount,
                mastered: nextWrong.mastered,
                lastWrongAt: nextWrong.lastWrongAt,
              },
            });
          }
        }
      }
    }
  }

  // 4. 统计字段
  const totalCount = await tx.examRecord.count({ where: { attemptId } });
  const correctCount = await tx.examRecord.count({
    where: { attemptId, isCorrect: true },
  });
  const score = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
  const durationMs = Math.max(0, finishedAt.getTime() - attempt.startedAt.getTime());

  // 5. 写回 ExamAttempt
  await tx.examAttempt.update({
    where: { id: attemptId },
    data: {
      status: finalStatus,
      finishedAt,
      totalCount,
      correctCount,
      score,
      durationMs,
    },
  });
}

/**
 * 主动结束当前会话(用户点"结束练习"或答完最后一题/模考交卷)。
 *
 * 流程:
 * 1. 校验 `exam:practice` 权限——模考最终交卷由学员本人发起,沿用同一权限点。
 * 2. 按 `(attemptId, userId)` 双条件确认会话存在且属于当前用户。
 * 3. 在事务中调用 `finalizeAttempt(tx, attemptId, 'FINISHED')`,
 *    由 helper 负责幂等、MOCK 补齐、统计字段等所有细节。
 * 4. `revalidatePath('/exam/history')` 让答题记录页拿到最新数据;
 *    `revalidatePath('/exam')` 让模式选择页刷新"继续上次"状态。
 *
 * 注意:即使 attempt 已经是 `FINISHED` / `ABANDONED`,本 Action 仍然返回
 * `{ ok: true }`(`finalizeAttempt` 内部幂等地直接返回)——这样客户端在
 * 网络重试 / 模考超时回流等场景下不会因为状态已变而看到误报错误。
 */
export async function finishSession(attemptId: string): Promise<ActionResult> {
  // 1. 权限
  const authed = await requirePerm('exam:practice');
  if (!authed.ok) return authed;

  // 2. 归属校验
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId: authed.user.id },
    select: { id: true },
  });
  if (!attempt) {
    return { ok: false, error: '会话不存在或无权访问' };
  }

  // 3. 事务结算
  await prisma.$transaction((tx) => finalizeAttempt(tx, attemptId, 'FINISHED'));

  // 4. 刷新缓存
  revalidatePath('/exam/history');
  revalidatePath('/exam');

  return { ok: true };
}

/**
 * 用户主动放弃当前会话(对应需求 5.9 / 8.2)。
 *
 * 与 `finishSession` 共享同一个 `finalizeAttempt` helper,只是 `finalStatus`
 * 不同:这里传 `'ABANDONED'`。MOCK 模式同样会触发"未答题补齐 + 计分",
 * 与超时兜底语义保持一致——这样无论会话是被用户主动放弃还是模考超时,
 * `ExamAttempt.totalCount / correctCount / score / durationMs` 都能正确反映
 * 整张卷子的真实情况,统计页/历史页才能给出连贯的视图。
 *
 * 流程:
 * 1. 校验 `exam:practice` 权限。模考会话由学员本人放弃,沿用同一权限点。
 * 2. 按 `(attemptId, userId)` 双条件确认会话存在且属于当前用户。
 * 3. 在事务中调用 `finalizeAttempt(tx, attemptId, 'ABANDONED')`。
 * 4. `revalidatePath('/exam/history')` 与 `revalidatePath('/exam')`,
 *    分别刷新历史记录页与模式选择页的"继续上次"状态。
 *
 * 注意:`finalizeAttempt` 自身幂等,因此即使会话已经结束(例如客户端在
 * 关闭页面时通过 `sendBeacon` 多次触发 `/api/exam/abandon`),本 Action
 * 也只会在第一次写入数据,后续调用直接返回 `{ ok: true }`。
 */
export async function abandonSession(attemptId: string): Promise<ActionResult> {
  const authed = await requirePerm('exam:practice');
  if (!authed.ok) return authed;

  const attempt = await prisma.examAttempt.findFirst({
    where: { id: attemptId, userId: authed.user.id },
    select: { id: true },
  });
  if (!attempt) {
    return { ok: false, error: '会话不存在或无权访问' };
  }

  await prisma.$transaction((tx) => finalizeAttempt(tx, attemptId, 'ABANDONED'));

  revalidatePath('/exam/history');
  revalidatePath('/exam');

  return { ok: true };
}

/**
 * 模考超时兜底:扫描当前用户(或指定用户)所有 `mode='MOCK' AND status='ONGOING'
 * AND expiresAt < now - 60s` 的会话,逐个通过 `finalizeAttempt` 结算为
 * `ABANDONED`(对应需求 5.4 / 5.9)。
 *
 * 调用时机:由 `/exam` 页面的 Server Component 在加载时主动调用作为兜底,
 * 这样即使学员关闭浏览器没有触发 `beforeunload` 的 `sendBeacon`,下次进入
 * 模式选择页时也能把过期模考整理掉,统计页与历史页随之得到正确视图。
 *
 * 60 秒缓冲是为了避免边界情况——客户端时钟略晚于服务端时,刚好走到 0:00
 * 就被服务端判定为已过期,反而抢在用户提交最后一题之前把会话置为
 * `ABANDONED`。多留 60 秒让客户端有充裕的时间把最后一次提交送达。
 *
 * 安全约束:入参 `userId` 是可选的,但为了避免普通用户通过传 `userId` 篡改
 * 他人会话,这里强制要求"目标 userId 必须等于当前已认证 userId"。未来若
 * 出现"管理员定期 cron 兜底所有用户"的需求,可通过新增 `exam:admin` 权限
 * 点放宽这条限制——当前阶段保持最小化。
 */
export async function adoptExpiredMock(
  userId?: string,
): Promise<ActionResult<{ count: number }>> {
  // 1. 权限:沿用 `exam:practice`——这是学员本人在 `/exam` 页加载时触发的
  //    兜底动作,不需要额外的 `exam:mock` 权限点。
  const authed = await requirePerm('exam:practice');
  if (!authed.ok) return authed;

  // 2. 默认只处理当前用户;显式传 userId 时仍只允许等于自己。
  const targetUserId = userId ?? authed.user.id;
  if (targetUserId !== authed.user.id) {
    return { ok: false, error: '无权访问其他用户的会话' };
  }

  // 3. 扫描过期的 ONGOING 模考会话。`expiresAt < now - 60s` 留出 60 秒缓冲。
  const cutoff = new Date(Date.now() - 60_000);
  const expired = await prisma.examAttempt.findMany({
    where: {
      userId: targetUserId,
      mode: 'MOCK',
      status: 'ONGOING',
      expiresAt: { lt: cutoff },
    },
    select: { id: true },
  });

  // 4. 逐个事务结算为 ABANDONED。`finalizeAttempt` 自身幂等,即使并发触发
  //    或者同一会话被扫描两次,也只有第一次会真正写入。
  for (const { id } of expired) {
    await prisma.$transaction((tx) => finalizeAttempt(tx, id, 'ABANDONED'));
  }

  // 5. 仅在确实结算了至少一个会话时刷新缓存,避免无谓的 revalidate。
  if (expired.length > 0) {
    revalidatePath('/exam/history');
    revalidatePath('/exam');
  }

  return { ok: true, data: { count: expired.length } };
}

// ---------------------------------------------------------------------------
// 12.1 toggleMastered:错题本"已掌握"标志手动切换
// ---------------------------------------------------------------------------

/**
 * `toggleMastered` 入参 schema:
 * - `wrongId`:错题本条目主键(`WrongQuestion.id`),非空字符串。
 * - `mastered`:目标布尔值,`true` 标记为已掌握,`false` 取消标记。
 */
const ToggleMasteredSchema = z.object({
  wrongId: z.string().min(1),
  mastered: z.boolean(),
});

/**
 * 用户在错题本页手动切换某条错题的"已掌握"标志(对应需求 10.3 / 10.4 / 10.7)。
 *
 * - 入参 `mastered: true`:把错题标记为已掌握。
 * - 入参 `mastered: false`:取消"已掌握"标记。
 *
 * 同时把 `rightCount` 重置为 0,避免下次重做立刻又被自动掌握(连续答对 3 次的
 * 计数从头开始)。这一行为对两种取值都成立——尤其是"取消掌握"时,如果不重置
 * `rightCount`,用户重新做这道题只要再答对 1 次就会被自动重新标记为已掌握,
 * 与用户手动取消的意图相悖。
 *
 * 流程:
 * 1. 校验 `exam:practice` 权限——错题本是练习相关功能,沿用同一权限点。
 * 2. zod 校验入参,失败返回 `提交不合法`。
 * 3. 按 `(wrongId, userId)` 双条件校验归属,确保用户只能修改自己的错题条目
 *    (对应 Error Handling 中的"按归属校验")。
 * 4. `update` 写入新的 `mastered` 与 `rightCount = 0`。
 * 5. `revalidatePath('/exam/wrong')` 刷新错题本页缓存。
 */
export async function toggleMastered(input: {
  wrongId: string;
  mastered: boolean;
}): Promise<ActionResult> {
  const authed = await requirePerm('exam:practice');
  if (!authed.ok) return authed;

  const parsed = ToggleMasteredSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: '提交不合法' };
  }
  const { wrongId, mastered } = parsed.data;

  // 按归属校验:错题条目必须属于当前用户
  const wrong = await prisma.wrongQuestion.findFirst({
    where: { id: wrongId, userId: authed.user.id },
    select: { id: true },
  });
  if (!wrong) {
    return { ok: false, error: '错题不存在或无权访问' };
  }

  await prisma.wrongQuestion.update({
    where: { id: wrongId },
    data: { mastered, rightCount: 0 },
  });

  revalidatePath('/exam/wrong');
  return { ok: true };
}
