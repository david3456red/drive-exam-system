/**
 * 导入流水线 —— 行级校验。
 *
 * 本模块把"未校验的导入行"(`unknown`,通常来自 `ImportSource.parse` 的输出)
 * 转换为"已校验的标准化导入行"(`ImportRow`)或一组错误码。
 *
 * 校验分为三层,错误**累积**返回(同一行可能同时触发多个错误码),
 * 便于 UI 一次性告知用户全部问题:
 *
 * 1. **形态校验**:复用 `@/lib/question-validate` 的 `ImportRowSchema` zod。
 *    覆盖必填字段、字段类型、`type` 枚举值、`categories` / `tags` 数组形态。
 * 2. **题型语义校验**:把 `optionA..optionF` 六列转成 `QuestionPayload.options`
 *    后调用 `validateQuestionPayload`,覆盖 SINGLE / MULTI / JUDGE 各自的
 *    答案 / 选项联动规则(Requirement 12.2 / 12.3 / 12.4)。
 * 3. **导入特有的语义补强**:`answer` 引用的字母对应列若为空 / 缺失,
 *    返回 `OPTION_MISSING_FOR_ANSWER`(Requirement 14.3)。即便 `type` 为
 *    JUDGE(理论上不引用 A-F 列),Excel 用户偶尔误填 `answer='B'` 也能被
 *    及时拦下。
 *
 * 该模块为纯函数,无 I/O,可被 PBT 直接覆盖。
 *
 * 验收依据:Requirement 13.4、Requirement 14.3。
 *
 * @module lib/import/validate
 */

import {
    ERR_OPTION_MISSING_FOR_ANSWER,
    ImportRowSchema,
    JUDGE_OPTIONS,
    validateQuestionPayload,
    type QuestionOption,
    type QuestionPayload,
} from '@/lib/question-validate';

import type { ImportRow } from './types';

// ============================================================
// 公开 API
// ============================================================

/** `validateRow` 成功返回的标准化结果。 */
export type ValidateRowOk = { ok: true; data: ImportRow };

/** `validateRow` 失败返回的错误结果。`row` 为人类可读的 1-indexed 行号。 */
export type ValidateRowErr = { ok: false; row: number; errors: string[] };

/** `validateRow` 的联合返回类型。 */
export type ValidateRowResult = ValidateRowOk | ValidateRowErr;

/**
 * 校验一条导入行。
 *
 * 输入:
 * - `row`:`unknown`,通常是 `ImportSource.parse` 输出数组的一项。允许任意
 *   形态——不合法时统一通过 `errors` 列表返回错误码,不抛异常。
 * - `rowIndex`:0-indexed 的行索引。函数对外暴露的 `row` 字段为
 *   `rowIndex + 1`,贴合 Excel "第 1 行"的人类直觉。
 *
 * 返回:
 * - 成功:`{ ok: true, data }`,`data` 为标准化的 `ImportRow`(`undefined`
 *   语义统一,`categories` / `tags` 必为数组)。
 * - 失败:`{ ok: false, row, errors }`,`errors` 为机器可读错误码列表。
 *
 * 错误码来源:
 * - `ImportRowSchema` 的 zod issue path/code(以 `path:code` 格式编码);
 * - `validateQuestionPayload` 返回的 `ERR_*` 常量;
 * - 本模块附加的 `OPTION_MISSING_FOR_ANSWER`(Requirement 14.3)。
 *
 * @param row      待校验的行(任意形态)
 * @param rowIndex 该行在原始来源中的 0-indexed 索引
 */
export function validateRow(row: unknown, rowIndex: number): ValidateRowResult {
  const humanRow = rowIndex + 1;
  const errors: string[] = [];

  // ----- 1. 形态校验:zod -----
  const parsed = ImportRowSchema.safeParse(row);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      // `issue.message` 来自 ImportRowSchema 中显式给出的机器可读 code(如
      // `content_required` / `answer_required`),否则回落到 zod 默认的 code。
      const code = issue.message || issue.code;
      errors.push(`${path}:${code}`);
    }
    return { ok: false, row: humanRow, errors };
  }
  const r = parsed.data;

  // ----- 2. 把 ImportRow 形态转成 QuestionPayload -----
  const options = r.type === 'JUDGE' ? JUDGE_OPTIONS.map((option) => ({ ...option })) : collectOptions(r);
  const payload: QuestionPayload = {
    type: r.type,
    content: r.content,
    imageUrl: r.imageUrl ?? null,
    options,
    answer: r.answer,
    explanation: r.explanation ?? null,
    tags: r.tags,
  };

  // ----- 3. 题型语义校验 -----
  const result = validateQuestionPayload(payload);
  if (!result.ok) {
    for (const code of result.errors) errors.push(code);
  }

  // ----- 4. 导入特有的语义补强:answer 引用的字母对应列必须存在且非空 -----
  //
  // `validateQuestionPayload` 已经覆盖 SINGLE / MULTI 的"answer 引用必有选项",
  // 但其判定基于 `payload.options`(已剔除空文本的列)。导入侧多一层显式检查
  // 是为了:
  // (a) 把"列单元格缺失"明确区分为 `OPTION_MISSING_FOR_ANSWER`,
  //     避免和"answer 字母非法"混淆;
  // (b) 让 JUDGE 题误填 `answer='B'` 这类异常也能被同一错误码识别。
  //
  // 仅对 `[A-F]` 范围内的字母做该检查;`T` / `F` / 非法字符不进入该规则,
  // 由 `validateQuestionPayload` 单独反馈。
  const referenced = uniqueAtoFLetters(r.answer);
  let missingReported = false;
  for (const letter of referenced) {
    const cell = readOptionColumn(r, letter);
    if (cell == null || cell.trim().length === 0) {
      if (!missingReported) {
        errors.push(ERR_OPTION_MISSING_FOR_ANSWER);
        missingReported = true; // 同一行最多报告一次,避免重复
      }
    }
  }

  if (errors.length > 0) {
    // 去重,避免 `validateQuestionPayload` 与本模块同时报告
    // `OPTION_MISSING_FOR_ANSWER` 时的重复
    const deduped = Array.from(new Set(errors));
    return { ok: false, row: humanRow, errors: deduped };
  }

  // ----- 5. 标准化为对外的 ImportRow(用 undefined 而非 null 表示缺省) -----
  const data: ImportRow = {
    type: r.type,
    content: r.content,
    imageUrl: r.imageUrl ?? undefined,
    optionA: r.optionA ?? undefined,
    optionB: r.optionB ?? undefined,
    optionC: r.optionC ?? undefined,
    optionD: r.optionD ?? undefined,
    optionE: r.optionE ?? undefined,
    optionF: r.optionF ?? undefined,
    answer: r.answer,
    categories: r.categories,
    explanation: r.explanation ?? undefined,
    tags: r.tags,
    bankCode: r.bankCode ?? undefined,
    sourceSite: r.sourceSite ?? undefined,
    sourceQuestionId: r.sourceQuestionId ?? undefined,
    sourceMeta: r.sourceMeta ?? undefined,
  };
  return { ok: true, data };
}

// ============================================================
// 内部工具
// ============================================================

/** 从 zod 解析后的形态收集 `options` 数组(剔除空白文本)。 */
function collectOptions(r: {
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  optionE: string | null;
  optionF: string | null;
}): QuestionOption[] {
  const out: QuestionOption[] = [];
  const cells: Array<[string, string | null]> = [
    ['A', r.optionA],
    ['B', r.optionB],
    ['C', r.optionC],
    ['D', r.optionD],
    ['E', r.optionE],
    ['F', r.optionF],
  ];
  for (const [key, raw] of cells) {
    if (typeof raw === 'string' && raw.trim().length > 0) {
      out.push({ key, text: raw });
    }
  }

  // JUDGE 题型在 `validateRow` 中直接注入固定选项,这里仅处理
  // SINGLE / MULTI 的 A-F 选项列。
  return out;
}

/** 读取某个字母对应的 `optionA..optionF` 单元格;非 [A-F] 字母返回 `null`。 */
function readOptionColumn(
  r: {
    optionA: string | null;
    optionB: string | null;
    optionC: string | null;
    optionD: string | null;
    optionE: string | null;
    optionF: string | null;
  },
  letter: string,
): string | null {
  switch (letter) {
    case 'A':
      return r.optionA;
    case 'B':
      return r.optionB;
    case 'C':
      return r.optionC;
    case 'D':
      return r.optionD;
    case 'E':
      return r.optionE;
    case 'F':
      return r.optionF;
    default:
      return null;
  }
}

/** 提取 `answer` 中位于 `[A-F]` 范围的去重字母,顺序按出现顺序保留。 */
function uniqueAtoFLetters(answer: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of answer) {
    if (ch >= 'A' && ch <= 'F' && !seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
}
