/**
 * 模考配置常量表(Mock_Config)。
 *
 * 模考的题量、时长、通过线由本表统一配置,不同题库可差异化设置而代码无需
 * 改动业务逻辑。`getMockConfig(bankCode)` 在未命中显式键时回退默认配置,
 * 使新增题库无需同时修改本文件就能开启模考能力。
 *
 * 本模块零依赖,纯常量与纯函数,可被 PBT 与单元测试直接引用。
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4
 */

/**
 * 单条模考配置。
 *
 * - `count`:每场模考随机抽取的题量。
 * - `durationMs`:模考时长,单位毫秒。`expiresAt = startedAt + durationMs`。
 * - `passScore`:通过分数线,取值 0..100,与 `ExamAttempt.score` 比较。
 */
export type MockConfig = {
  readonly count: number;
  readonly durationMs: number;
  readonly passScore: number;
};

export type MockConfigSource = {
  readonly subjectCode?: string | null;
  readonly mockQuestionCount?: number | null;
  readonly mockDurationMs?: number | null;
  readonly mockPassScore?: number | null;
};

/**
 * 用于在 `MOCK_CONFIG` 中保存默认配置的内部哨兵键。
 *
 * 选用前缀 `__` 避免与任何业务 `bankCode`(如 `subject_1`、`subject_4`)冲突。
 * 不导出为 public API,外部一律通过 `getMockConfig(bankCode)` 访问默认值。
 */
const DEFAULT_KEY = '__default' as const;

/**
 * 模考配置常量表,key 为题库 `code`(`QuestionBank.code`),value 为该题库
 * 的模考配置。`__default` 键保存兜底配置,供 `getMockConfig` 在未命中时返回。
 *
 * - `subject_1`(科目一):100 题、45 分钟、90 分通过。
 * - `subject_4`(科目四):50 题、30 分钟、90 分通过。
 * - `__default`(兜底):50 题、30 分钟、90 分通过。
 *
 * 通过 `Object.freeze` 阻止运行时被改写;每条配置本身亦为冻结对象,
 * 防止意外的字段级突变穿透到引擎层。
 */
export const MOCK_CONFIG: Readonly<Record<string, MockConfig>> = Object.freeze({
  subject_1: Object.freeze({
    count: 100,
    durationMs: 45 * 60 * 1000,
    passScore: 90,
  }),
  subject_4: Object.freeze({
    count: 50,
    durationMs: 30 * 60 * 1000,
    passScore: 90,
  }),
  [DEFAULT_KEY]: Object.freeze({
    count: 50,
    durationMs: 30 * 60 * 1000,
    passScore: 90,
  }),
  K1: Object.freeze({
    count: 100,
    durationMs: 45 * 60 * 1000,
    passScore: 90,
  }),
  K4: Object.freeze({
    count: 50,
    durationMs: 30 * 60 * 1000,
    passScore: 90,
  }),
  MF: Object.freeze({
    count: 100,
    durationMs: 45 * 60 * 1000,
    passScore: 90,
  }),
  TS: Object.freeze({
    count: 100,
    durationMs: 30 * 60 * 1000,
    passScore: 90,
  }),
  SL: Object.freeze({
    count: 100,
    durationMs: 45 * 60 * 1000,
    passScore: 90,
  }),
});

/**
 * 按题库 `code` 取模考配置。未命中显式键时返回 `MOCK_CONFIG.__default`,
 * 保证调用方对任意 bankCode 都能拿到一份合法配置,而无需在调用点处理
 * `undefined` 兜底。
 *
 * @param bankCode `QuestionBank.code`,例如 `subject_1` / `subject_4`。
 * @returns 该题库的 `MockConfig`,未命中时为默认配置。
 */
export function getMockConfig(bankCode: string, source?: MockConfigSource | null): MockConfig {
  const fallback = MOCK_CONFIG[source?.subjectCode ?? bankCode] ?? MOCK_CONFIG[bankCode] ?? MOCK_CONFIG[DEFAULT_KEY]!;
  return {
    count: source?.mockQuestionCount ?? fallback.count,
    durationMs: source?.mockDurationMs ?? fallback.durationMs,
    passScore: source?.mockPassScore ?? fallback.passScore,
  };
}
