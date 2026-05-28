/**
 * 分页查询助手模块(Pagination_Query)。
 *
 * 提供错题列表、答题记录列表、学员列表与学员汇总四个 RSC / 教练后台共用的
 * 只读查询函数,所有列表查询都返回统一的 `Page<T>` 形态,使前端无需为不同列表
 * 各自维护分页 + 计数 + 边界处理逻辑。
 *
 * 设计要点(Requirement 26.1..26.5 / CP-12):
 *
 * - **同事务快照**:items 与 total 通过 `prisma.$transaction([findMany, count])`
 *   一次性读出,杜绝"翻页时新写入的行让总数与当前页不一致"的撕裂窗口。
 * - **稳定排序**:列表查询全部使用"业务键 desc + id desc"双键 orderBy,保证
 *   跨页遍历时同 ID 不会被多次返回(CP-12 第 3 项)。
 *   - listAttempts:`(startedAt desc, id desc)`(Requirement 26.5)
 *   - listWrongQuestions:`(lastWrongAt desc, id desc)`
 *   - listStudents:`(createdAt desc, id desc)`
 * - **分页参数兜底**:`pageSize` 缺省 20、`page <= 0` 视为 1、`pageSize > 100`
 *   截断到 100、`pageSize <= 0` 视为 1,任何非有限数都退化为合法默认值,杜绝
 *   `findMany({ skip: NaN })` 等运行时异常。
 * - **listAttempts 状态过滤**:仅返回 `status ∈ {FINISHED, ABANDONED}` 的记录
 *   (Requirement 26.5),`ONGOING` 会话由 `/exam` 主页通过 `adoptExpiredMock`
 *   等其它路径处理,不进入历史列表。
 * - **listWrongQuestions 过滤**:支持 `bankId?` 与
 *   `masteredFilter ∈ {all, mastered, unmastered}`,后者默认 `'all'`(Requirement 26.1)。
 * - **学员角色识别**:学员通过 `Role.code ∈ {student_strict, student_normal}`
 *   定义,与 RBAC 种子保持一致。
 *
 * 投影类型(`WrongQuestionView` / `AttemptListItem` / `StudentListItem`)是
 * 故意收敛的视图层 DTO,不直接返回 Prisma 实体,避免诸如 `passwordHash` /
 * `userAnswer` 等敏感或冗余字段意外泄漏到列表 RSC / Server Action 响应中。
 *
 * 本模块函数的第一个参数为 `PrismaClient`(参考 `question-loader.ts` 的契约),
 * 注意:数组形式的 `prisma.$transaction([...])` 仅 PrismaClient 支持,
 * 事务客户端(`Prisma.TransactionClient`)不支持,故此处不接受 tx 客户端。
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import type { ExamMode, ExamStatus, QuestionType } from '@/lib/enums';

// ===== 常量 =====

/** 默认分页大小。 */
const DEFAULT_PAGE_SIZE = 20;

/** 单页最大返回行数;超过将被截断。 */
const MAX_PAGE_SIZE = 100;

/**
 * 历史会话允许的状态集合。
 *
 * `ONGOING` 会话由 `/exam` 入口的 `adoptExpiredMock` 与续答路径处理,
 * 不进入答题历史 / 学员统计的口径。
 */
const COMPLETED_STATUSES = ['FINISHED', 'ABANDONED'] as const;

/** 学员角色码集合,与 RBAC 种子(`prisma/seed.ts`)保持同步。 */
const STUDENT_ROLE_CODES = ['student_strict', 'student_normal'] as const;

// ===== 公共类型 =====

/**
 * 通用分页结果。所有列表查询统一返回该形态,便于前端复用同一套
 * `Pagination` UI 与 hook。
 *
 * 不变量(CP-12):
 * - `items.length <= pageSize`
 * - `(page - 1) * pageSize + items.length <= total`
 * - 跨页遍历所有合法页码,`items` 间无重复主键
 */
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * 错题列表项。
 *
 * 故意只挑选给前端列表展示用的字段,既避免把整张 `Question` 实体的 `options` /
 * `answer` / `explanation` 等内容序列化到列表 payload(分页页大表会显著放大),
 * 也明确表达"列表态不需要这些字段"。
 */
export type WrongQuestionView = {
  id: string;
  questionId: string;
  questionContent: string;
  questionType: QuestionType;
  bankId: string;
  bankName: string;
  mastered: boolean;
  wrongCount: number;
  rightCount: number;
  lastWrongAt: Date;
};

/**
 * 答题记录列表项(对应 `ExamAttempt` 的"已结算"投影)。
 *
 * `bankId` / `bankName` 为可空:`WRONG_REVIEW` 模式下 `ExamAttempt.bankId = null`。
 * `score` / `totalCount` / `correctCount` / `durationMs` / `finishedAt` 在 schema 层
 * 也允许 null,但鉴于 `listAttempts` 仅返回 `COMPLETED_STATUSES` 中的记录,
 * 这些字段在生产数据中应当总是非空(由 `finalizeAttempt` 在结算时一次性写入)。
 * 类型仍保留 `| null` 以反映 schema 真实形态,UI 渲染时按需兜底。
 */
export type AttemptListItem = {
  id: string;
  mode: ExamMode;
  status: ExamStatus;
  bankId: string | null;
  bankName: string | null;
  score: number | null;
  totalCount: number | null;
  correctCount: number | null;
  durationMs: number | null;
  startedAt: Date;
  finishedAt: Date | null;
};

/**
 * 学员列表项,供教练端 `/admin/student-stats` 列表渲染。
 *
 * `totalAttempts` 与 `lastPracticedAt` 仅统计已结算(`FINISHED` / `ABANDONED`)
 * 会话,与 `getStudentSummary` 的口径保持一致,避免列表行与详情页数字打架。
 */
export type StudentListItem = {
  id: string;
  username: string;
  name: string | null;
  totalAttempts: number;
  lastPracticedAt: Date | null;
};

/**
 * 学员汇总信息。
 *
 * - `totalAttempts`:已结算会话数。
 * - `avgCorrectRate`:平均正确率(0..1 之间的小数,UI 自行格式化为百分比)。
 *   采用"汇总正确题数 / 汇总总题数"的池化口径,而不是"逐场正确率取平均",
 *   理由:前者等价于"该学员所有已答题中答对的比例",直接对应教练关心的指标
 *   "学员整体掌握度";后者会让一场仅 1 题且全错的会话与一场 100 题答对 99
 *   的会话权重相等,失真。
 * - `lastPracticedAt`:最近一次已结算会话的 `startedAt`,可用于"沉默学员提醒"。
 *
 * `totalAttempts === 0` 时 `avgCorrectRate` 显式返回 `0`,避免 0/0 的 NaN 污染 UI。
 */
export type StudentSummary = {
  totalAttempts: number;
  avgCorrectRate: number;
  lastPracticedAt: Date | null;
};

/** 错题筛选模式。 */
export type MasteredFilter = 'all' | 'mastered' | 'unmastered';

// ===== 内部:分页参数兜底 =====

/**
 * 对外暴露的分页参数都允许"宽松输入",在内部统一钳制为合法值。
 *
 * 规则(Requirement 26.x + 用户体验兜底):
 * - `page`:非有限数 / `<= 0` 一律视为 1;否则向下取整。
 * - `pageSize`:`undefined` / 非有限数 → `DEFAULT_PAGE_SIZE`;
 *   `< 1` 视为 1;`> MAX_PAGE_SIZE` 截断到 `MAX_PAGE_SIZE`;否则向下取整。
 * - `skip = (page - 1) * pageSize`,在合法范围内一定 ≥ 0。
 */
function normalizePagination(
  page: number,
  pageSize: number | undefined,
): { page: number; pageSize: number; skip: number } {
  const safePage =
    Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

  let safeSize: number;
  if (pageSize === undefined || !Number.isFinite(pageSize)) {
    safeSize = DEFAULT_PAGE_SIZE;
  } else {
    const floored = Math.floor(pageSize);
    safeSize = Math.min(Math.max(floored, 1), MAX_PAGE_SIZE);
  }

  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize };
}

// ===== listWrongQuestions =====

/**
 * 分页查询当前用户的错题。
 *
 * - `bankId` 缺省时不限题库;给定时通过关联 `Question.bankId` 过滤。
 * - `masteredFilter` 默认 `'all'`;`'mastered'` 仅 `mastered=true`;
 *   `'unmastered'` 仅 `mastered=false`。
 * - 排序键 `(lastWrongAt desc, id desc)` 保证 CP-12 跨页无重复。
 */
export async function listWrongQuestions(
  prisma: PrismaClient,
  input: {
    userId: string;
    page: number;
    pageSize?: number;
    bankId?: string;
    masteredFilter?: MasteredFilter;
  },
): Promise<Page<WrongQuestionView>> {
  const { page, pageSize, skip } = normalizePagination(input.page, input.pageSize);
  const masteredFilter = input.masteredFilter ?? 'all';

  const where: Prisma.WrongQuestionWhereInput = {
    userId: input.userId,
    ...(input.bankId ? { question: { bankId: input.bankId } } : {}),
    ...(masteredFilter === 'mastered'
      ? { mastered: true }
      : masteredFilter === 'unmastered'
        ? { mastered: false }
        : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.wrongQuestion.findMany({
      where,
      orderBy: [{ lastWrongAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
      select: {
        id: true,
        questionId: true,
        mastered: true,
        wrongCount: true,
        rightCount: true,
        lastWrongAt: true,
        question: {
          select: {
            content: true,
            type: true,
            bankId: true,
            bank: { select: { name: true } },
          },
        },
      },
    }),
    prisma.wrongQuestion.count({ where }),
  ]);

  const items: WrongQuestionView[] = rows.map((r) => ({
    id: r.id,
    questionId: r.questionId,
    questionContent: r.question.content,
    questionType: r.question.type as QuestionType,
    bankId: r.question.bankId,
    bankName: r.question.bank.name,
    mastered: r.mastered,
    wrongCount: r.wrongCount,
    rightCount: r.rightCount,
    lastWrongAt: r.lastWrongAt,
  }));

  return { items, total, page, pageSize };
}

// ===== listAttempts =====

/**
 * 分页查询某用户的"已结算"答题记录。
 *
 * 仅返回 `status ∈ {FINISHED, ABANDONED}` 的记录(Requirement 26.5),按
 * `(startedAt desc, id desc)` 稳定排序。`bankId` / `mode` 为可选过滤维度,
 * 用于 `/exam/history` 与 `/admin/student-stats/[userId]` 的题库 / 模式筛选。
 */
export async function listAttempts(
  prisma: PrismaClient,
  input: {
    userId: string;
    page: number;
    pageSize?: number;
    bankId?: string;
    mode?: ExamMode;
  },
): Promise<Page<AttemptListItem>> {
  const { page, pageSize, skip } = normalizePagination(input.page, input.pageSize);

  const where: Prisma.ExamAttemptWhereInput = {
    userId: input.userId,
    status: { in: [...COMPLETED_STATUSES] },
    ...(input.bankId ? { bankId: input.bankId } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.examAttempt.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
      select: {
        id: true,
        mode: true,
        status: true,
        bankId: true,
        score: true,
        totalCount: true,
        correctCount: true,
        durationMs: true,
        startedAt: true,
        finishedAt: true,
        bank: { select: { name: true } },
      },
    }),
    prisma.examAttempt.count({ where }),
  ]);

  const items: AttemptListItem[] = rows.map((r) => ({
    id: r.id,
    mode: r.mode as ExamMode,
    status: r.status as ExamStatus,
    bankId: r.bankId,
    bankName: r.bank?.name ?? null,
    score: r.score,
    totalCount: r.totalCount,
    correctCount: r.correctCount,
    durationMs: r.durationMs,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  }));

  return { items, total, page, pageSize };
}

// ===== listStudents =====

/**
 * 分页查询学员列表(供教练端 `/admin/student-stats` 使用)。
 *
 * 实现思路:
 * 1. 在事务内先按角色过滤拉取一页 `User`,同时统计每个用户已结算 attempt 的数量
 *    (用 Prisma `_count` + 关系 `where` 过滤),并取 total 用于分页计数;
 * 2. 在事务外用 `groupBy` 取这一页用户的 `lastPracticedAt`(MAX startedAt)。
 *    选择 fan-out:`groupBy` 在 SQLite 上等价于一个 `GROUP BY userId` 查询,
 *    避免 N+1 next.js 串行查询。`lastPracticedAt` 不在主事务内是有意为之:
 *    它是次要展示字段,允许与 items 之间存在 ms 级时滞,而强一致的 items+total
 *    是 CP-12 的硬要求。
 *
 * 学员判定标准为 `Role.code ∈ {student_strict, student_normal}`,与
 * `prisma/seed.ts` 中的 RBAC 种子保持一致。
 */
export async function listStudents(
  prisma: PrismaClient,
  input: {
    page: number;
    pageSize?: number;
  },
): Promise<Page<StudentListItem>> {
  const { page, pageSize, skip } = normalizePagination(input.page, input.pageSize);

  const where: Prisma.UserWhereInput = {
    role: { code: { in: [...STUDENT_ROLE_CODES] } },
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
      select: {
        id: true,
        username: true,
        name: true,
        _count: {
          select: {
            attempts: {
              where: { status: { in: [...COMPLETED_STATUSES] } },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // 第二步:为这一页学员补齐 lastPracticedAt。userIds 为空时跳过,
  // 避免 `IN ()` 在某些 driver 上的非法 SQL。
  const userIds = users.map((u) => u.id);
  const lastPracticedMap = new Map<string, Date>();
  if (userIds.length > 0) {
    const grouped = await prisma.examAttempt.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        status: { in: [...COMPLETED_STATUSES] },
      },
      _max: { startedAt: true },
    });
    for (const g of grouped) {
      if (g._max.startedAt) {
        lastPracticedMap.set(g.userId, g._max.startedAt);
      }
    }
  }

  const items: StudentListItem[] = users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    totalAttempts: u._count.attempts,
    lastPracticedAt: lastPracticedMap.get(u.id) ?? null,
  }));

  return { items, total, page, pageSize };
}

// ===== getStudentSummary =====

/**
 * 取某学员的整体汇总(总尝试次数 + 平均正确率 + 最近一次练习时间)。
 *
 * 仅统计已结算会话(`status ∈ {FINISHED, ABANDONED}`),与 listAttempts /
 * listStudents 的口径保持一致。三条查询通过 `prisma.$transaction([...])`
 * 包裹在同一事务快照中,确保"总数 / 平均率 / 最近时间"互相之间不会读到
 * 撕裂的中间状态(例如计入了一次结算但漏算了它的 startedAt)。
 *
 * `avgCorrectRate` 采用池化口径:`sum(correctCount) / sum(totalCount)`,
 * 范围 [0, 1]。`totalAttempts === 0` 或 `sum(totalCount) === 0` 时显式
 * 返回 0,避免 0/0 的 NaN 污染前端。
 */
export async function getStudentSummary(
  prisma: PrismaClient,
  userId: string,
): Promise<StudentSummary> {
  const where: Prisma.ExamAttemptWhereInput = {
    userId,
    status: { in: [...COMPLETED_STATUSES] },
  };

  const [totalAttempts, agg, latest] = await prisma.$transaction([
    prisma.examAttempt.count({ where }),
    prisma.examAttempt.aggregate({
      where,
      _sum: { totalCount: true, correctCount: true },
    }),
    prisma.examAttempt.findFirst({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      select: { startedAt: true },
    }),
  ]);

  const sumTotal = agg._sum.totalCount ?? 0;
  const sumCorrect = agg._sum.correctCount ?? 0;
  const avgCorrectRate =
    totalAttempts === 0 || sumTotal === 0 ? 0 : sumCorrect / sumTotal;

  return {
    totalAttempts,
    avgCorrectRate,
    lastPracticedAt: latest?.startedAt ?? null,
  };
}
