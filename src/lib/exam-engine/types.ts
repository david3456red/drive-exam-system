/**
 * 答题模式 (Exam Modes) - 公共类型与配置常量
 *
 * 本模块集中维护 examEngine 在跨层（DB / Server Action / UI）共享的类型与配置：
 *
 * - `EXAM_MODES` / `ExamMode`：五种答题模式枚举（顺序、随机、章节、模考、错题重做）。
 * - `ATTEMPT_STATUS` / `AttemptStatus`：会话状态机的可取值。
 * - `EXAM_MODE_DISPLAY`：模式 → 中文展示名映射，UI 各处统一使用。
 * - `MOCK_CONFIG` / `getMockConfig`：模拟考试题量、时长与通过分数的题库级配置。
 * - `ActionResult`：与现有 `src/app/admin/(protected)/banks/actions.ts`
 *   保持一致的 Server Action 统一返回类型。
 *
 * 全部为纯类型与常量，无任何 I/O，可在客户端与服务端共用。
 */

/** 五种答题模式 */
export const EXAM_MODES = ['SEQUENTIAL', 'RANDOM', 'CHAPTER', 'MOCK', 'WRONG_REVIEW'] as const;
export type ExamMode = (typeof EXAM_MODES)[number];

/** 会话状态:进行中 / 已结束 / 已放弃 */
export const ATTEMPT_STATUS = ['ONGOING', 'FINISHED', 'ABANDONED'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUS)[number];

/** 答题模式 → 中文展示名 */
export const EXAM_MODE_DISPLAY: Record<ExamMode, string> = {
  SEQUENTIAL: '顺序练习',
  RANDOM: '随机练习',
  CHAPTER: '章节练习',
  MOCK: '模拟考试',
  WRONG_REVIEW: '错题重做',
};

/**
 * 模拟考试配置:按题库 `code` 索引,集中维护以便后期 admin 化。
 *
 * - `count`:模考抽题数量
 * - `durationMs`:倒计时时长(毫秒)
 * - `passScore`:通过分数(满分 100)
 *
 * 未匹配到具体题库时回退到 `__default`。
 */
export const MOCK_CONFIG: Record<string, { count: number; durationMs: number; passScore: number }> = {
  subject_1: { count: 100, durationMs: 45 * 60 * 1000, passScore: 90 },
  subject_4: { count: 50, durationMs: 30 * 60 * 1000, passScore: 90 },
  __default: { count: 50, durationMs: 30 * 60 * 1000, passScore: 90 },
};

/**
 * 根据题库 `code` 获取模考配置;未配置的题库返回默认值。
 *
 * @param bankCode 题库 `QuestionBank.code`(如 `subject_1`)
 */
export function getMockConfig(bankCode: string): { count: number; durationMs: number; passScore: number } {
  return MOCK_CONFIG[bankCode] ?? MOCK_CONFIG.__default;
}

/**
 * Server Action 统一返回类型,与
 * `src/app/admin/(protected)/banks/actions.ts` 保持一致。
 *
 * - 成功且无数据:`{ ok: true }`
 * - 成功带数据:`{ ok: true, data: T }`
 * - 失败:`{ ok: false, error: string }`
 */
export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };
