/**
 * 题目加载模块(Question_Loader)。
 *
 * 负责把 5 种答题模式各自的"输入"转换为一份**冻结**的题目 ID 顺序快照,
 * 供 `Session_Manager.startSession` 在创建 `ExamAttempt` 时一次性写入
 * `questionOrder`(以及 CHAPTER 的 `categoryIds` / MOCK 的 `expiresAt`)。
 *
 * 本模块依赖 Prisma Client(读 `Question` / `Category` / `WrongQuestion` 表),
 * 但不做任何写库或事务操作;调用方在外层事务壳中持久化结果。
 *
 * 关键正确性约束(Requirement 15.2..15.6 与 CP-2..CP-5):
 *
 * - SEQUENTIAL / CHAPTER 严格按 `(createdAt asc, id asc)` 双键稳定排序,
 *   这是 CP-3 稳定性的依据(同 createdAt 时退化为 id 字典序保证可重现)。
 * - RANDOM 在题库整库上做 Fisher–Yates 洗牌,种子来源于 `crypto.randomBytes(8)`,
 *   每次会话独立、非可预测。
 * - CHAPTER 通过 `expandCategoryDescendants` 把入参 `categoryIds` 展开为
 *   含全部后代分类的闭包,再按闭包过滤题目(CP-4)。
 * - MOCK 在题库整库上随机抽 `MOCK_CONFIG[bankCode].count` 题;题数不足时
 *   返回 `INSUFFICIENT_QUESTIONS`,不做"有多少返多少"的降级。
 * - WRONG_REVIEW 加载当前用户 `mastered=false` 错题按 `lastWrongAt desc` 排序(CP-5)。
 * - 任意来源集合为空时,返回对应的语义化错误码,而不是 `ok:true` + 空数组,
 *   方便上层 Server Action 直接转译为前端文案。
 */

import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { getMockConfig, type MockConfigSource } from './mock-config';

/**
 * 题目加载模式输入。`mode` 为判别字段,字段集合按需收紧。
 *
 * - `SEQUENTIAL` / `RANDOM`:仅需 `bankId`。
 * - `CHAPTER`:需 `bankId` + 用户选择的 `categoryIds`(根分类,实现内部递归展开后代)。
 * - `MOCK`:需 `bankId` + `bankCode` 用于查 `MOCK_CONFIG`(避免再次查库)。
 * - `WRONG_REVIEW`:仅需 `userId`(跨题库错题集合,无 `bankId` 概念)。
 */
export type LoadInput =
  | { mode: 'SEQUENTIAL'; bankId: string }
  | { mode: 'RANDOM'; bankId: string }
  | { mode: 'CHAPTER'; bankId: string; categoryIds: string[] }
  | { mode: 'CHAPTER_RANDOM'; bankId: string; categoryIds: string[] }
  | { mode: 'MOCK'; bankId: string; bankCode: string; mockConfigSource?: MockConfigSource | null }
  | { mode: 'WRONG_REVIEW'; userId: string };

/**
 * 题目加载结果。成功时返回题目 ID 顺序与可选的 `expiresAt`(仅 MOCK);
 * 失败时返回语义化错误码:
 *
 * - `BANK_EMPTY`:SEQUENTIAL / RANDOM 模式下题库整库题数为 0。
 * - `CHAPTER_EMPTY`:CHAPTER 模式下扩展后的分类集合或题目集合为空。
 * - `INSUFFICIENT_QUESTIONS`:MOCK 模式下题库题数 < `MOCK_CONFIG[bankCode].count`,
 *   或题库题数为 0(后者也归入此分类,避免与 BANK_EMPTY 在 MOCK 上语义重叠)。
 * - `NO_WRONG_QUESTIONS`:WRONG_REVIEW 模式下用户没有未掌握错题。
 */
export type LoadResult =
  | { ok: true; questionIds: string[]; expiresAt?: Date }
  | {
      ok: false;
      error:
        | 'BANK_EMPTY'
        | 'CHAPTER_EMPTY'
        | 'INSUFFICIENT_QUESTIONS'
        | 'NO_WRONG_QUESTIONS';
    };

/**
 * 按答题模式加载题目顺序快照。
 *
 * 对外提供唯一入口,模式分支详见模块顶部注释。函数本身不写库,也不持有事务,
 * 由 `startSession` Server Action 在外层 `prisma.$transaction` 中持久化。
 *
 * @param prisma Prisma Client(可以是 `prisma` 单例,也可以是 `tx` 事务客户端)
 * @param input 模式输入
 */
export async function loadQuestionsForMode(
  prisma: PrismaClient,
  input: LoadInput,
): Promise<LoadResult> {
  switch (input.mode) {
    case 'SEQUENTIAL':
      return loadSequential(prisma, input.bankId);
    case 'RANDOM':
      return loadRandom(prisma, input.bankId);
    case 'CHAPTER':
      return loadChapter(prisma, input.bankId, input.categoryIds);
    case 'CHAPTER_RANDOM':
      return loadChapterRandom(prisma, input.bankId, input.categoryIds);
    case 'MOCK':
      return loadMock(prisma, input.bankId, input.bankCode, input.mockConfigSource);
    case 'WRONG_REVIEW':
      return loadWrongReview(prisma, input.userId);
    default: {
      // 穷举保护:TypeScript 在此分支应为 never。运行时若意外走到这里,
      // 退化为通用空错误,而不是抛异常,避免在事务壳中触发回滚级联。
      const _exhaustive: never = input;
      void _exhaustive;
      return { ok: false, error: 'BANK_EMPTY' };
    }
  }
}

/**
 * 递归展开分类后代闭包。
 *
 * 输入若干根分类 ID,返回包含这些根 + 全部后代的去重 ID 数组;输入为空时返回 `[]`。
 *
 * 实现采用 BFS,每层 `findMany({ where: { parentId: { in: frontier } } })` 一次,
 * 避免逐个根独立递归带来的 N 次往返。理论复杂度 O(深度) 次查询。
 *
 * 该函数对环形 parent 引用(数据脏写)是健壮的:`seen` 集合保证已访问过的
 * 节点不会再次进入 frontier,因此即使 A→B→A 也只会被遍历一次而不无限循环。
 */
export async function expandCategoryDescendants(
  prisma: PrismaClient,
  rootIds: string[],
): Promise<string[]> {
  if (rootIds.length === 0) {
    return [];
  }

  const seen = new Set<string>(rootIds);
  let frontier: string[] = [...rootIds];

  while (frontier.length > 0) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    const nextFrontier: string[] = [];
    for (const { id } of children) {
      if (!seen.has(id)) {
        seen.add(id);
        nextFrontier.push(id);
      }
    }
    frontier = nextFrontier;
  }

  return Array.from(seen);
}

// ===== 模式实现 =====

/** SEQUENTIAL:整库题目按 `(createdAt asc, id asc)` 稳定排序。 */
async function loadSequential(
  prisma: PrismaClient,
  bankId: string,
): Promise<LoadResult> {
  const rows = await prisma.question.findMany({
    where: { bankId },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (rows.length === 0) {
    return { ok: false, error: 'BANK_EMPTY' };
  }
  return { ok: true, questionIds: rows.map((r) => r.id) };
}

/** RANDOM:整库题目用 Fisher–Yates 洗牌,种子来自 `crypto.randomBytes`。 */
async function loadRandom(
  prisma: PrismaClient,
  bankId: string,
): Promise<LoadResult> {
  const rows = await prisma.question.findMany({
    where: { bankId },
    select: { id: true },
    // 取数顺序对结果无影响(随后会被洗牌),用稳定排序便于调试可重现性。
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (rows.length === 0) {
    return { ok: false, error: 'BANK_EMPTY' };
  }
  const ids = rows.map((r) => r.id);
  fisherYatesShuffleInPlace(ids);
  return { ok: true, questionIds: ids };
}

/** CHAPTER:展开分类后代闭包,过滤 bankId + 闭包,稳定排序。 */
async function loadChapter(
  prisma: PrismaClient,
  bankId: string,
  rootCategoryIds: string[],
): Promise<LoadResult> {
  if (rootCategoryIds.length === 0) {
    return { ok: false, error: 'CHAPTER_EMPTY' };
  }
  const expanded = await expandCategoryDescendants(prisma, rootCategoryIds);
  if (expanded.length === 0) {
    return { ok: false, error: 'CHAPTER_EMPTY' };
  }
  const rows = await prisma.question.findMany({
    where: {
      bankId,
      categories: { some: { categoryId: { in: expanded } } },
    },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (rows.length === 0) {
    return { ok: false, error: 'CHAPTER_EMPTY' };
  }
  return { ok: true, questionIds: rows.map((r) => r.id) };
}

async function loadChapterRandom(
  prisma: PrismaClient,
  bankId: string,
  rootCategoryIds: string[],
): Promise<LoadResult> {
  const result = await loadChapter(prisma, bankId, rootCategoryIds);
  if (!result.ok) return result;
  fisherYatesShuffleInPlace(result.questionIds);
  return result;
}

/**
 * MOCK:整库随机抽 `MOCK_CONFIG[bankCode].count` 题;题数不足返回
 * `INSUFFICIENT_QUESTIONS`,不做降级。同时返回 `expiresAt = now + durationMs`,
 * 由调用方一次性写入 `ExamAttempt.expiresAt`。
 */
async function loadMock(
  prisma: PrismaClient,
  bankId: string,
  bankCode: string,
  mockConfigSource?: MockConfigSource | null,
): Promise<LoadResult> {
  const config = getMockConfig(bankCode, mockConfigSource);
  const rows = await prisma.question.findMany({
    where: { bankId },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (rows.length < config.count) {
    return { ok: false, error: 'INSUFFICIENT_QUESTIONS' };
  }
  const ids = rows.map((r) => r.id);
  fisherYatesShuffleInPlace(ids);
  const sampled = ids.slice(0, config.count);
  const expiresAt = new Date(Date.now() + config.durationMs);
  return { ok: true, questionIds: sampled, expiresAt };
}

/** WRONG_REVIEW:`mastered=false` 错题按 `lastWrongAt desc` 排序。 */
async function loadWrongReview(
  prisma: PrismaClient,
  userId: string,
): Promise<LoadResult> {
  const rows = await prisma.wrongQuestion.findMany({
    where: { userId, mastered: false },
    orderBy: { lastWrongAt: 'desc' },
    select: { questionId: true },
  });
  if (rows.length === 0) {
    return { ok: false, error: 'NO_WRONG_QUESTIONS' };
  }
  return { ok: true, questionIds: rows.map((r) => r.questionId) };
}

// ===== 内部:Fisher–Yates 洗牌(crypto.randomBytes 种子的 xorshift64* PRNG)=====

/**
 * 原地 Fisher–Yates 洗牌。每次调用都会构造一个新的 PRNG,种子取自
 * `crypto.randomBytes(8)` 的 64 位整数,故每次会话独立、不可预测。
 */
function fisherYatesShuffleInPlace<T>(arr: T[]): void {
  const next = createSeededRandom();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    // 钳制兜底:理论上 next() ∈ [0,1),但极端浮点边界下保险。
    const k = j > i ? i : j;
    const tmp = arr[i]!;
    arr[i] = arr[k]!;
    arr[k] = tmp;
  }
}

/**
 * 构造 xorshift64* PRNG,返回 `() => number`,输出落在 `[0, 1)`。
 *
 * 种子来自 `crypto.randomBytes(8)` 解读为 64 位无符号整数;若巧合为 0
 * (xorshift 不允许零状态)则替换为 1。每次调用本工厂函数都生成独立的
 * PRNG 实例,从而每场答题会话的洗牌序列互不相关。
 *
 * 选用 xorshift64*(而非更复杂的 PCG / Mersenne Twister)平衡分布质量与
 * 实现简洁;任务描述允许使用基于 `crypto.randomBytes` 的种子驱动 PRNG。
 */
function createSeededRandom(): () => number {
  const seedBuf = randomBytes(8);
  let state = seedBuf.readBigUInt64BE();
  if (state === 0n) {
    state = 1n;
  }
  const MASK = (1n << 64n) - 1n;

  return () => {
    state ^= (state << 13n) & MASK;
    state ^= state >> 7n;
    state ^= (state << 17n) & MASK;
    state &= MASK;
    // 取高 53 位映射到 [0, 1):JS 安全整数精度上限。
    return Number(state >> 11n) / 2 ** 53;
  };
}
