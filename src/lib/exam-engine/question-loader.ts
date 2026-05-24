/**
 * 答题模式 (Exam Modes) - 按模式加载题目 (question-loader)
 *
 * 本模块负责为五种答题模式构造"会话题目快照":
 *
 * - `SEQUENTIAL`:按 `Question.createdAt` 升序加载整库题目。
 * - `RANDOM`:加载整库题目后用 Fisher–Yates 算法打乱。
 * - `CHAPTER`:把所选 `categoryIds` 递归展开为含全部后代的分类集合,
 *   再通过 `QuestionCategory` 关联过滤,按 `createdAt` 升序返回。
 * - `MOCK`:按题库 `code` 查 `getMockConfig` 得到题量与时长;若题库题目数
 *   不足配置题量则返回 `INSUFFICIENT_FOR_MOCK`,否则随机抽取并返回 `expiresAt`。
 * - `WRONG_REVIEW`:从 `WrongQuestion` 取 `mastered=false` 条目按 `lastWrongAt`
 *   降序排列,再回查题目正文并保持错题顺序。
 *
 * 所有读取统一通过依赖注入的 `PrismaClient` 进行,便于单元/集成测试时注入测试库。
 * 调用方拿到结果后再决定是否写 `ExamAttempt`,本模块不做任何写操作。
 *
 * 空集与不可开始的边界一律以 `{ ok: false, reason }` 结构返回,由上层 Server
 * Action 转换为面向用户的中文文案。
 */

import type { PrismaClient, Question } from '@prisma/client';
import { getMockConfig } from './types';

/**
 * `loadQuestionsForMode` 的入参。各模式所需字段不同,使用 discriminated union
 * 区分:
 *
 * - `SEQUENTIAL` / `RANDOM` / `MOCK`:仅需 `bankId`。
 * - `CHAPTER`:除 `bankId` 外还需非空 `categoryIds`(空筛选由调用方在更上层
 *   拦截,本模块对空数组依然安全:展开结果为空,自然返回 `EMPTY_CATEGORY`)。
 * - `WRONG_REVIEW`:仅需 `userId`,跨题库加载该用户未掌握的错题。
 */
export type LoadQuestionsInput =
  | { mode: 'SEQUENTIAL'; bankId: string }
  | { mode: 'RANDOM'; bankId: string }
  | { mode: 'CHAPTER'; bankId: string; categoryIds: string[] }
  | { mode: 'MOCK'; bankId: string }
  | { mode: 'WRONG_REVIEW'; userId: string };

/**
 * `loadQuestionsForMode` 的返回值。
 *
 * - `ok: true`:加载成功,`questionIds` 与 `questions` 长度一致且顺序对齐;
 *   仅 `MOCK` 模式额外返回 `expiresAt`(由 `getMockConfig().durationMs` 推算)。
 * - `ok: false`:无法构造合法会话,`reason` 表明具体原因供上层映射文案:
 *   - `EMPTY_BANK`:`SEQUENTIAL` / `RANDOM` 模式题库为空。
 *   - `EMPTY_CATEGORY`:`CHAPTER` 模式所选分类树下无题目。
 *   - `EMPTY_WRONG`:`WRONG_REVIEW` 模式无未掌握的错题。
 *   - `INSUFFICIENT_FOR_MOCK`:`MOCK` 模式题库题目数少于配置题量。
 */
export type LoadQuestionsResult =
  | { ok: true; questionIds: string[]; questions: Question[]; expiresAt?: Date }
  | { ok: false; reason: 'EMPTY_BANK' | 'EMPTY_CATEGORY' | 'EMPTY_WRONG' | 'INSUFFICIENT_FOR_MOCK' };

/**
 * 递归展开分类的所有后代,返回包含原始 ID 与全部后代 ID 的去重数组。
 *
 * 实现采用 BFS:从输入 ID 集出发,每轮按 `Category.parentId in 当前层` 查询
 * 直接子分类,把新发现的 ID 加入下一层,直到没有新增。
 *
 * - 重复 ID 自动去重(借助 `Set`)。
 * - 输入为空数组时直接返回空数组,不发起任何查询。
 * - 不依赖分类树深度的硬编码限制——只要 BFS 收敛即可终止。
 *
 * @param prisma 已注入的 Prisma Client
 * @param ids    起始分类 ID 集合
 * @returns 含原始 ID 与所有后代 ID 的去重数组
 */
export async function expandCategoryDescendants(
  prisma: PrismaClient,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) {
    return [];
  }

  const collected = new Set<string>(ids);
  let frontier: string[] = [...ids];

  while (frontier.length > 0) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });

    const nextFrontier: string[] = [];
    for (const { id } of children) {
      if (!collected.has(id)) {
        collected.add(id);
        nextFrontier.push(id);
      }
    }
    frontier = nextFrontier;
  }

  return Array.from(collected);
}

/**
 * Fisher–Yates 洗牌:返回一个新数组,原数组不被修改。
 *
 * 接受可选的 `randomFn` 注入,默认使用 `Math.random`,在测试中可注入确定性
 * 随机源以便复现用例(例如 `mulberry32` 之类的伪随机)。
 *
 * `randomFn` 必须返回 `[0, 1)` 区间的浮点数;若返回 1,索引可能越界,
 * 因此用 `Math.min` 做防御性钳制。
 *
 * @param arr       待打乱的数组(原数组不会被修改)
 * @param randomFn  可选的随机源,默认 `Math.random`
 * @returns 打乱后的新数组
 */
export function fisherYatesShuffle<T>(arr: readonly T[], randomFn: () => number = Math.random): T[] {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const r = Math.min(Math.floor(randomFn() * (i + 1)), i);
    const tmp = result[i];
    result[i] = result[r];
    result[r] = tmp;
  }
  return result;
}

/**
 * 按模式加载题目,返回会话所需的 `questionIds` / `questions` 快照。
 *
 * 本函数只读 DB,不写任何记录;调用方(Server Action)拿到结果后再决定是否
 * 创建 `ExamAttempt`、是否写入 `questionOrder` / `expiresAt` / `categoryIds`。
 *
 * 各模式实现要点:
 *
 * - `SEQUENTIAL`:`bankId` 范围内全部题目按 `createdAt asc`;空库返回 `EMPTY_BANK`。
 * - `RANDOM`:`bankId` 范围内全部题目随机打乱;空库返回 `EMPTY_BANK`。
 * - `CHAPTER`:用 `expandCategoryDescendants` 展开 `categoryIds`,通过
 *   `QuestionCategory` 关联过滤,按 `createdAt asc`;空集返回 `EMPTY_CATEGORY`。
 * - `MOCK`:先读题库 `code`,经 `getMockConfig(code).count` 决定题量;
 *   若题库题目数 < `count` 返回 `INSUFFICIENT_FOR_MOCK`;否则随机抽取并返回
 *   `expiresAt = now + durationMs`。
 * - `WRONG_REVIEW`:从 `WrongQuestion` 取 `mastered=false` 按 `lastWrongAt desc`;
 *   空集返回 `EMPTY_WRONG`;再 `findMany({ id in ids })` 加载题目正文,并按
 *   错题顺序保留(因 `findMany` 不保证顺序,需手工按 ID 索引重排)。
 *
 * @param prisma 已注入的 Prisma Client
 * @param input  按模式区分的入参(discriminated union)
 * @returns 加载结果或失败原因
 */
export async function loadQuestionsForMode(
  prisma: PrismaClient,
  input: LoadQuestionsInput,
): Promise<LoadQuestionsResult> {
  switch (input.mode) {
    case 'SEQUENTIAL': {
      const questions = await prisma.question.findMany({
        where: { bankId: input.bankId },
        orderBy: { createdAt: 'asc' },
      });
      if (questions.length === 0) {
        return { ok: false, reason: 'EMPTY_BANK' };
      }
      return {
        ok: true,
        questionIds: questions.map((q) => q.id),
        questions,
      };
    }

    case 'CHAPTER': {
      const expanded = await expandCategoryDescendants(prisma, input.categoryIds);
      if (expanded.length === 0) {
        return { ok: false, reason: 'EMPTY_CATEGORY' };
      }
      const questions = await prisma.question.findMany({
        where: {
          bankId: input.bankId,
          categories: { some: { categoryId: { in: expanded } } },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (questions.length === 0) {
        return { ok: false, reason: 'EMPTY_CATEGORY' };
      }
      return {
        ok: true,
        questionIds: questions.map((q) => q.id),
        questions,
      };
    }

    case 'RANDOM': {
      const questions = await prisma.question.findMany({
        where: { bankId: input.bankId },
        orderBy: { createdAt: 'asc' },
      });
      if (questions.length === 0) {
        return { ok: false, reason: 'EMPTY_BANK' };
      }
      const shuffled = fisherYatesShuffle(questions);
      return {
        ok: true,
        questionIds: shuffled.map((q) => q.id),
        questions: shuffled,
      };
    }

    case 'MOCK': {
      const bank = await prisma.questionBank.findUnique({
        where: { id: input.bankId },
        select: { code: true },
      });
      const config = getMockConfig(bank?.code ?? '');
      const questions = await prisma.question.findMany({
        where: { bankId: input.bankId },
        orderBy: { createdAt: 'asc' },
      });
      if (questions.length < config.count) {
        return { ok: false, reason: 'INSUFFICIENT_FOR_MOCK' };
      }
      const picked = fisherYatesShuffle(questions).slice(0, config.count);
      return {
        ok: true,
        questionIds: picked.map((q) => q.id),
        questions: picked,
        expiresAt: new Date(Date.now() + config.durationMs),
      };
    }

    case 'WRONG_REVIEW': {
      const wrongs = await prisma.wrongQuestion.findMany({
        where: { userId: input.userId, mastered: false },
        orderBy: { lastWrongAt: 'desc' },
        select: { questionId: true },
      });
      if (wrongs.length === 0) {
        return { ok: false, reason: 'EMPTY_WRONG' };
      }
      const orderedIds = wrongs.map((w) => w.questionId);
      const fetched = await prisma.question.findMany({
        where: { id: { in: orderedIds } },
      });
      // findMany 不保证顺序,按错题本顺序重排;若题目被删除则跳过该 ID。
      const byId = new Map<string, Question>();
      for (const q of fetched) {
        byId.set(q.id, q);
      }
      const questions: Question[] = [];
      const questionIds: string[] = [];
      for (const id of orderedIds) {
        const q = byId.get(id);
        if (q) {
          questions.push(q);
          questionIds.push(id);
        }
      }
      if (questions.length === 0) {
        return { ok: false, reason: 'EMPTY_WRONG' };
      }
      return { ok: true, questionIds, questions };
    }
  }
}
