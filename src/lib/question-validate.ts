/**
 * 题目题型校验工具(Question_Manager / Importer 共享)。
 *
 * 本模块负责"题目载荷在落库前的语义校验",分为两层:
 *
 * 1. `ImportRowSchema`(zod) —— 校验 Excel / JSON 导入的**行级形态**。
 *    Excel 列模型(`type, content, imageUrl, optionA..optionF, answer,
 *    categories, explanation, tags`)已由 importer 在解析阶段转成 JS 对象;
 *    其中 `categories` 与 `tags` 列已按 `|` 拆分为 `string[]`(详见
 *    Requirement 14.2)。本 schema 仅做"基本形状校验"——必填字段类型与
 *    非空,**不**做题型相关的答案/选项联动校验,后者交给
 *    `validateQuestionPayload`。
 *
 * 2. `validateQuestionPayload(payload)` —— 在已组装为 `QuestionPayload`
 *    的题目对象上执行题型相关规则:
 *    - SINGLE: `answer` 长度 1 且 `[A-F]`,且对应选项存在且非空。
 *    - MULTI:  `answer` 长度 ≥ 2,字符 `[A-F]` 子集,升序无重复,
 *              且各对应选项均存在且非空。
 *    - JUDGE:  强制 `options=[{key:'T',text:'正确'},{key:'F',text:'错误'}]`,
 *              `answer ∈ {T, F}`。
 *
 * 错误码以机器可读字符串返回,UI 与导入预览页据此渲染人类文案。
 *
 * 该模块为纯函数 / zod schema,不依赖 Prisma 或任何 I/O。
 *
 * 验收依据:Requirement 12.1, 12.2, 12.3, 12.4。
 *
 * @module lib/question-validate
 */

import { z } from 'zod';

import { QUESTION_TYPES, type QuestionType } from '@/lib/enums';

// ============================================================
// 错误码常量(机器可读)
// ============================================================

/** 答案字符集 / 长度不符合题型要求(SINGLE/MULTI 用 [A-F]、JUDGE 不在此处使用) */
export const ERR_INVALID_ANSWER_FORMAT = 'INVALID_ANSWER_FORMAT';
/** answer 字母引用了一个不存在或文本为空的选项 */
export const ERR_OPTION_MISSING_FOR_ANSWER = 'OPTION_MISSING_FOR_ANSWER';
/** MULTI: answer 字母不是严格升序或存在重复 */
export const ERR_MULTI_NOT_ASCENDING = 'MULTI_NOT_ASCENDING';
/** JUDGE: options 与固定形态 [{T:'正确'},{F:'错误'}] 不一致 */
export const ERR_JUDGE_OPTIONS_INVALID = 'JUDGE_OPTIONS_INVALID';
/** JUDGE: answer 不在 {T, F} 范围内 */
export const ERR_JUDGE_ANSWER_INVALID = 'JUDGE_ANSWER_INVALID';

/** 校验失败时可能返回的错误码联合类型(供调用方做 i18n 映射) */
export type QuestionValidationErrorCode =
  | typeof ERR_INVALID_ANSWER_FORMAT
  | typeof ERR_OPTION_MISSING_FOR_ANSWER
  | typeof ERR_MULTI_NOT_ASCENDING
  | typeof ERR_JUDGE_OPTIONS_INVALID
  | typeof ERR_JUDGE_ANSWER_INVALID;

// ============================================================
// JUDGE 固定形态
// ============================================================

/** JUDGE 题型强制的选项形态(Requirement 12.4) */
export const JUDGE_OPTIONS: ReadonlyArray<{ key: string; text: string }> = Object.freeze([
  Object.freeze({ key: 'T', text: '正确' }),
  Object.freeze({ key: 'F', text: '错误' }),
]);

// ============================================================
// ImportRowSchema —— 导入行级形态校验
// ============================================================

/**
 * 把"空字符串 / 仅含空白的字符串"也视作"未填写"的归一化器,统一为 `null`。
 *
 * Excel 解析(`xlsx` 包)对空单元格通常给出 `null`,但偶尔也会给空串;
 * JSON 导入则可能直接传 `''`。统一归一可让下游 schema/校验更稳定。
 */
function emptyToNull(value: unknown): unknown {
  if (typeof value === 'string' && value.trim().length === 0) return null;
  return value;
}

/** 可选的字符串字段(允许 `null` / `undefined` / `''`)。 */
const OptionalStringSchema = z
  .preprocess(emptyToNull, z.union([z.string(), z.null()]).optional())
  .transform((v) => (v == null ? null : v));

/** 可选的选项列(`optionA..optionF`)。Excel 单元格可能为 `null` / 空字符串。 */
const OptionalOptionCellSchema = OptionalStringSchema;

/**
 * Excel / JSON 导入行的基础形态 schema。
 *
 * 字段语义:
 * - `type`:题型,枚举 `QUESTION_TYPES`(`SINGLE` / `MULTI` / `JUDGE`)。
 * - `content`:题干文本,必填非空。
 * - `imageUrl`:可选题图 URL。
 * - `optionA..optionF`:六个选项列,均可选(JUDGE 题不应填写,SINGLE/MULTI
 *   题至少应填写 `answer` 引用的字母列)。具体的"answer 引用必有选项"约束
 *   由 `validateQuestionPayload` 兜底,本 schema 不在此处强制。
 * - `answer`:答案字符串。SINGLE 形如 `'B'`、MULTI 形如 `'AC'`、JUDGE 为
 *   `'T'` 或 `'F'`。本 schema 仅校验是必填字符串,字符集 / 排序由
 *   `validateQuestionPayload` 校验。
 * - `categories`:分类名数组(已由 importer 按 `|` 拆分),允许空数组。
 * - `explanation`:可选解析文本。
 * - `tags`:标签数组(已由 importer 按 `|` 拆分),允许空数组。
 *
 * 该 schema 只做基本形状校验。详细的题型相关校验请把行转换为
 * `QuestionPayload` 后调用 `validateQuestionPayload`。
 */
export const ImportRowSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  content: z
    .preprocess(emptyToNull, z.string({ required_error: 'content_required' }))
    .refine((s) => s.trim().length > 0, 'content_required'),
  imageUrl: OptionalStringSchema,
  optionA: OptionalOptionCellSchema,
  optionB: OptionalOptionCellSchema,
  optionC: OptionalOptionCellSchema,
  optionD: OptionalOptionCellSchema,
  optionE: OptionalOptionCellSchema,
  optionF: OptionalOptionCellSchema,
  answer: z
    .preprocess(emptyToNull, z.string({ required_error: 'answer_required' }))
    .refine((s) => s.trim().length > 0, 'answer_required'),
  categories: z.array(z.string()).default([]),
  explanation: OptionalStringSchema,
  tags: z.array(z.string()).default([]),
  bankCode: OptionalStringSchema,
});

/** `ImportRowSchema` 解析后的 TS 类型(选项列以 `optionA..optionF` 形式存在)。 */
export type ImportRow = z.infer<typeof ImportRowSchema>;

// ============================================================
// QuestionPayload —— CRUD / 落库前的结构化形态
// ============================================================

/** 单个选项:`key` 为字母标识(如 `A`、`B`、`T`、`F`),`text` 为选项文案。 */
export type QuestionOption = {
  key: string;
  text: string;
};

/**
 * 题目载荷:导入与 CRUD Server Action 的共同入参形态。
 *
 * 与 `ImportRow` 的差异:
 * - 选项使用 `Array<{ key, text }>` 而非 `optionA..optionF` 六列。
 * - 不含 `categories`(分类挂载由上层事务处理)。
 *
 * 落库前必须通过 `validateQuestionPayload` 校验。
 */
export type QuestionPayload = {
  type: QuestionType;
  content: string;
  imageUrl?: string | null;
  options: QuestionOption[];
  answer: string;
  explanation?: string | null;
  tags?: string[];
};

/** `validateQuestionPayload` 的返回结构。 */
export type QuestionValidationResult =
  | { ok: true }
  | { ok: false; errors: QuestionValidationErrorCode[] };

// ============================================================
// validateQuestionPayload —— 题型相关规则校验
// ============================================================

/** 大写字母 [A-F] 单字符正则 */
const A_TO_F = /^[A-F]$/;
/** 用于 SINGLE 答案的严格匹配 */
const SINGLE_ANSWER_RE = /^[A-F]$/;

/**
 * 校验题目载荷是否满足题型语义。
 *
 * - SINGLE: answer 长度 1 且 `[A-F]`,且对应选项存在且非空。
 * - MULTI:  answer 长度 ≥ 2,字符 `[A-F]` 子集,严格升序无重复,
 *            各对应选项存在且非空。
 * - JUDGE:  options 必须严格等于 `[{key:'T',text:'正确'},{key:'F',text:'错误'}]`,
 *            answer ∈ {T, F}。
 *
 * 多类错误**累积**返回(同一 payload 可能同时触发多个错误码),
 * 便于 UI 一次性告知用户全部问题。
 *
 * 该函数为纯函数:输入只读,无 I/O,无副作用。
 *
 * @param payload 待校验的题目载荷
 * @returns 通过返回 `{ ok: true }`,失败返回 `{ ok: false, errors: [...] }`
 */
export function validateQuestionPayload(payload: QuestionPayload): QuestionValidationResult {
  const errors: QuestionValidationErrorCode[] = [];

  switch (payload.type) {
    case 'SINGLE':
      validateSingle(payload, errors);
      break;
    case 'MULTI':
      validateMulti(payload, errors);
      break;
    case 'JUDGE':
      validateJudge(payload, errors);
      break;
    default: {
      // 兜底:不在 QuestionType 联合中的题型(zod 上层一般已挡住)。
      // 视为答案格式非法。
      errors.push(ERR_INVALID_ANSWER_FORMAT);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ------------------------------------------------------------
// 内部:SINGLE / MULTI / JUDGE 子规则
// ------------------------------------------------------------

function validateSingle(payload: QuestionPayload, errors: QuestionValidationErrorCode[]): void {
  const { answer, options } = payload;
  if (!SINGLE_ANSWER_RE.test(answer)) {
    errors.push(ERR_INVALID_ANSWER_FORMAT);
    return; // 后续选项联动检查依赖合法 answer,提前结束避免误报
  }
  if (!hasNonEmptyOption(options, answer)) {
    errors.push(ERR_OPTION_MISSING_FOR_ANSWER);
  }
}

function validateMulti(payload: QuestionPayload, errors: QuestionValidationErrorCode[]): void {
  const { answer, options } = payload;
  const chars = answer.split('');

  // 长度 ≥ 2
  if (chars.length < 2) {
    errors.push(ERR_INVALID_ANSWER_FORMAT);
  }

  // 字符必须是 [A-F] 子集
  const allInRange = chars.every((c) => A_TO_F.test(c));
  if (!allInRange) {
    errors.push(ERR_INVALID_ANSWER_FORMAT);
  }

  // 升序无重复(只在所有字符合法时才有意义,但即便不合法也要给出排序错误信号
  // 以便用户一次看到全部问题)。
  if (allInRange && !isStrictlyAscendingDistinct(chars)) {
    errors.push(ERR_MULTI_NOT_ASCENDING);
  }

  // 选项联动:仅当字符全部在 [A-F] 内时检查,避免无意义的选项查找
  if (allInRange) {
    for (const ch of new Set(chars)) {
      if (!hasNonEmptyOption(options, ch)) {
        errors.push(ERR_OPTION_MISSING_FOR_ANSWER);
        break; // 一次报告即可,避免重复错误码
      }
    }
  }
}

function validateJudge(payload: QuestionPayload, errors: QuestionValidationErrorCode[]): void {
  const { answer, options } = payload;

  if (!isJudgeOptionsExact(options)) {
    errors.push(ERR_JUDGE_OPTIONS_INVALID);
  }
  if (answer !== 'T' && answer !== 'F') {
    errors.push(ERR_JUDGE_ANSWER_INVALID);
  }
}

// ------------------------------------------------------------
// 内部工具
// ------------------------------------------------------------

/** 判断 `chars` 是否严格升序且无重复。 */
function isStrictlyAscendingDistinct(chars: string[]): boolean {
  for (let i = 1; i < chars.length; i++) {
    const prev = chars[i - 1] as string;
    const curr = chars[i] as string;
    if (prev >= curr) return false;
  }
  return true;
}

/** 检查 `options` 中存在 `key=letter` 的项,且其 `text` 去空白后非空。 */
function hasNonEmptyOption(options: QuestionOption[], letter: string): boolean {
  const found = options.find((o) => o.key === letter);
  if (!found) return false;
  if (typeof found.text !== 'string') return false;
  return found.text.trim().length > 0;
}

/** 严格判定 `options` 是否等于 `[{T:'正确'},{F:'错误'}]`(数量、顺序、键、文本均相等)。 */
function isJudgeOptionsExact(options: QuestionOption[]): boolean {
  if (!Array.isArray(options) || options.length !== JUDGE_OPTIONS.length) return false;
  for (let i = 0; i < JUDGE_OPTIONS.length; i++) {
    const expected = JUDGE_OPTIONS[i] as { key: string; text: string };
    const actual = options[i];
    if (!actual || actual.key !== expected.key || actual.text !== expected.text) {
      return false;
    }
  }
  return true;
}
