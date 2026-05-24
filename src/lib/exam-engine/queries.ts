/**
 * 答题模式 (Exam Modes) - 错题本 / 答题记录 / 教练统计 分页查询 helper
 *
 * 本模块集中封装"列表 + 分页 + 筛选"类查询,供以下页面/组件复用:
 *
 * - `/exam/wrong` 错题本(`listWrongQuestions`)
 * - `/exam/history` 学员答题记录(`listAttempts`)
 * - `/admin/student-stats` 教练后台学员列表(`listStudents`)
 * - `/admin/student-stats/[userId]` 教练单学员汇总(`getStudentSummary`)
 *
 * 设计要点:
 *
 * - 所有函数都接收明确的 `userId` / `page` / `pageSize` 参数,
 *   不在内部读取 `auth()`,以便页面层负责权限校验后再调用。
 * - 返回值统一为 `PaginatedResult<T>`,包含 `items / total / page / pageSize`,
 *   方便上层渲染分页器与"共 X 条"汇总文案。
 * - 排序顺序与 `design.md` 的 Property 12 保持一致(错题本按
 *   `lastWrongAt desc`、答题记录按 `startedAt desc`、教练学员列表按
 *   `username asc`)。
 * - 教练统计只保留"已结束 / 已放弃"的会话(`status in ('FINISHED','ABANDONED')`),
 *   `ONGOING` 不计入次数与平均分,以免会话还没结算时把学员的真实成绩拉低。
 * - 无任何写操作,纯查询,因此不调用 `revalidatePath`。
 */

import { prisma } from '@/lib/db';
import type { ExamMode } from '@/lib/exam-engine/types';

// ---------------------------------------------------------------------------
// 公共类型
// ---------------------------------------------------------------------------

/**
 * 分页查询的统一返回结构。`items.length` 在最后一页可能小于 `pageSize`,
 * 但保证 `<= pageSize`(对应 Property 12)。
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 错题本掌握状态筛选:
 * - `'all'`(默认):不附加 `mastered` 过滤
 * - `'mastered'`:仅返回 `mastered: true`
 * - `'unmastered'`:仅返回 `mastered: false`
 */
export type MasteredFilter = 'all' | 'mastered' | 'unmastered';

/** 学员角色集合,与 `src/lib/role-checks.ts` 的 `FRONTEND_ROLES` 保持一致。 */
const STUDENT_ROLE_NAMES = ['student_strict', 'student_normal'] as const;

/**
 * 把"任意输入"规范化为合法的分页参数。
 *
 * - `page` 至少为 1,非整数向下取整。
 * - `pageSize` 限制在 `[1, 100]`,默认 20。
 *
 * 这些约束与设计文档 Property 12 的"`items.length <= 20`"假设兼容,
 * 同时把上界放宽到 100 以便教练后台需要时一次拉取更大批次。
 */
function normalizePage(page: number | undefined, pageSize: number | undefined): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const p = Math.max(1, Math.floor(page ?? 1));
  const ps = Math.max(1, Math.min(100, Math.floor(pageSize ?? 20)));
  return { page: p, pageSize: ps, skip: (p - 1) * ps, take: ps };
}

/**
 * 把 `MasteredFilter` 转换为 Prisma 的 `where` 片段。
 * `'all'` → 不附加任何条件,直接返回空对象。
 */
function masteredWhere(filter: MasteredFilter | undefined): { mastered?: boolean } {
  switch (filter ?? 'all') {
    case 'mastered':
      return { mastered: true };
    case 'unmastered':
      return { mastered: false };
    case 'all':
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// 错题本分页:listWrongQuestions
// ---------------------------------------------------------------------------

/**
 * 错题本条目分页查询。
 *
 * - 强制按 `userId` 过滤,只返回当前用户的错题。
 * - `bankId` 可选:通过关联 `question.bankId` 过滤"某题库下的错题"。
 * - `masteredFilter` 可选,默认 `'all'`:控制"已掌握 / 未掌握 / 全部"。
 * - 排序:`lastWrongAt desc`(最近答错的优先,与错题本页规约一致)。
 *
 * 返回的 `items` 已经把 `question` 的核心字段(id / type / content / bankId)
 * 关联出来,方便页面直接渲染题干。完整选项可在详情页按需再查。
 */
export async function listWrongQuestions(input: {
  userId: string;
  page?: number;
  pageSize?: number;
  bankId?: string;
  masteredFilter?: MasteredFilter;
}): Promise<
  PaginatedResult<{
    id: string;
    questionId: string;
    question: { id: string; type: string; content: string; bankId: string };
    wrongCount: number;
    rightCount: number;
    mastered: boolean;
    lastWrongAt: Date;
  }>
> {
  const { page, pageSize, skip, take } = normalizePage(input.page, input.pageSize);

  const where = {
    userId: input.userId,
    ...masteredWhere(input.masteredFilter),
    ...(input.bankId ? { question: { bankId: input.bankId } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.wrongQuestion.findMany({
      where,
      orderBy: { lastWrongAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        questionId: true,
        wrongCount: true,
        rightCount: true,
        mastered: true,
        lastWrongAt: true,
        question: {
          select: { id: true, type: true, content: true, bankId: true },
        },
      },
    }),
    prisma.wrongQuestion.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

// ---------------------------------------------------------------------------
// 答题记录分页:listAttempts
// ---------------------------------------------------------------------------

/**
 * 答题记录(`ExamAttempt`)分页查询,供学员"我的答题记录"与教练"单学员历史"
 * 共用。
 *
 * - 强制按 `userId` 过滤。
 * - `bankId` 可选:精确匹配某题库的记录(`WRONG_REVIEW` 模式 `bankId = null`,
 *   传入的 `bankId` 不会命中,这是符合预期的——错题回顾不属于任何题库)。
 * - `mode` 可选:按答题模式精确过滤。
 * - 仅返回 `status in ('FINISHED', 'ABANDONED')` 的会话:`ONGOING` 不算"历史"。
 * - 排序:`startedAt desc`。
 *
 * 关联 `bank` 字段方便页面直接展示题库名,避免在客户端再做一轮查询。
 */
export async function listAttempts(input: {
  userId: string;
  page?: number;
  pageSize?: number;
  bankId?: string;
  mode?: ExamMode;
}): Promise<
  PaginatedResult<{
    id: string;
    bankId: string | null;
    bank: { id: string; name: string } | null;
    mode: string;
    status: string;
    totalCount: number;
    correctCount: number;
    score: number | null;
    durationMs: number | null;
    startedAt: Date;
    finishedAt: Date | null;
  }>
> {
  const { page, pageSize, skip, take } = normalizePage(input.page, input.pageSize);

  const where = {
    userId: input.userId,
    status: { in: ['FINISHED', 'ABANDONED'] as string[] },
    ...(input.bankId ? { bankId: input.bankId } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.examAttempt.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        bankId: true,
        mode: true,
        status: true,
        totalCount: true,
        correctCount: true,
        score: true,
        durationMs: true,
        startedAt: true,
        finishedAt: true,
      },
    }),
    prisma.examAttempt.count({ where }),
  ]);

  // `ExamAttempt.bankId` 在 schema 中是个 `String?` 字段,没有声明 Prisma
  // 关系(WRONG_REVIEW 模式 bankId=null,且 bank 删除时不需要级联),因此
  // 这里手动批量查询 `QuestionBank` 再做内存 join。bankId 在当前页通常只
  // 涉及少数几个题库,一次 `findMany({ where: { id: { in: [...] } } })`
  // 就能把题库名补齐,N+1 风险可以忽略。
  const bankIds = Array.from(
    new Set(rows.map((r) => r.bankId).filter((x): x is string => !!x)),
  );
  const banks =
    bankIds.length === 0
      ? []
      : await prisma.questionBank.findMany({
          where: { id: { in: bankIds } },
          select: { id: true, name: true },
        });
  const bankMap = new Map(banks.map((b) => [b.id, b]));

  const items = rows.map((r) => ({
    id: r.id,
    bankId: r.bankId,
    bank: r.bankId ? bankMap.get(r.bankId) ?? null : null,
    mode: r.mode,
    status: r.status,
    totalCount: r.totalCount,
    correctCount: r.correctCount,
    score: r.score,
    durationMs: r.durationMs,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  }));

  return { items, total, page, pageSize };
}

// ---------------------------------------------------------------------------
// 教练后台:listStudents / getStudentSummary
// ---------------------------------------------------------------------------

/**
 * 计算单个学员的统计字段。抽出独立函数以便 `listStudents` 与
 * `getStudentSummary` 复用。
 *
 * - `totalAttempts`:历史 `FINISHED + ABANDONED` 的会话总数(`ONGOING` 不计)。
 * - `averageAccuracy`:对应会话的 `score` 平均值,保留一位小数;
 *   无任何记录或所有 `score` 都为 `null` 时返回 `null`。
 * - `lastPracticeAt`:最近一次会话的 `startedAt`(同样限定在
 *   `FINISHED / ABANDONED` 内,避免"开了模考没做完"也算最近练习)。
 */
async function computeStudentStats(userId: string): Promise<{
  totalAttempts: number;
  averageAccuracy: number | null;
  lastPracticeAt: Date | null;
}> {
  const where = {
    userId,
    status: { in: ['FINISHED', 'ABANDONED'] as string[] },
  };

  const [totalAttempts, scoreAgg, latest] = await Promise.all([
    prisma.examAttempt.count({ where }),
    prisma.examAttempt.aggregate({
      where: { ...where, score: { not: null } },
      _avg: { score: true },
    }),
    prisma.examAttempt.findFirst({
      where,
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    }),
  ]);

  const avg = scoreAgg._avg.score;
  const averageAccuracy =
    avg === null || avg === undefined ? null : Math.round(avg * 10) / 10;

  return {
    totalAttempts,
    averageAccuracy,
    lastPracticeAt: latest?.startedAt ?? null,
  };
}

/**
 * 教练后台学员列表分页查询。
 *
 * - 仅返回角色为 `student_strict` 或 `student_normal` 的用户。
 * - 排序:`username asc`,与设计文档教练后台规约一致。
 * - 每个学员的统计字段(总次数 / 平均分 / 最近练习时间)通过
 *   `Promise.all + computeStudentStats` 并发聚合;先做用户分页再聚合,
 *   保证一次查询只对当前页 N 个学员发起 N×3 个统计查询,数量可控。
 */
export async function listStudents(input: {
  page?: number;
  pageSize?: number;
}): Promise<
  PaginatedResult<{
    id: string;
    username: string;
    name: string;
    totalAttempts: number;
    averageAccuracy: number | null;
    lastPracticeAt: Date | null;
  }>
> {
  const { page, pageSize, skip, take } = normalizePage(input.page, input.pageSize);

  const where = {
    role: { name: { in: [...STUDENT_ROLE_NAMES] as string[] } },
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { username: 'asc' },
      skip,
      take,
      select: {
        id: true,
        username: true,
        name: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  const items = await Promise.all(
    users.map(async (u) => {
      const stats = await computeStudentStats(u.id);
      return {
        id: u.id,
        username: u.username,
        // 列表层把 `name` 兜底为 username,保证下游不需要再判空。
        name: u.name ?? u.username,
        totalAttempts: stats.totalAttempts,
        averageAccuracy: stats.averageAccuracy,
        lastPracticeAt: stats.lastPracticeAt,
      };
    }),
  );

  return { items, total, page, pageSize };
}

/**
 * 获取单个学员的汇总信息(用户基本信息 + 统计字段),供
 * `/admin/student-stats/[userId]` 详情页头部卡片使用。
 *
 * - 用户不存在时返回 `null`(由调用方决定 `notFound()` 还是 `redirect()`)。
 * - 统计字段口径与 `listStudents` 完全一致。
 */
export async function getStudentSummary(userId: string): Promise<{
  user: { id: string; username: string; name: string } | null;
  totalAttempts: number;
  averageAccuracy: number | null;
  lastPracticeAt: Date | null;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, name: true },
  });
  if (!user) return null;

  const stats = await computeStudentStats(userId);

  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name ?? user.username,
    },
    totalAttempts: stats.totalAttempts,
    averageAccuracy: stats.averageAccuracy,
    lastPracticeAt: stats.lastPracticeAt,
  };
}
