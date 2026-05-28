/**
 * Property-based tests for `src/lib/question-validate.ts`.
 *
 * 覆盖 `validateQuestionPayload` 的题型相关规则,与 Requirement 12 一一对应:
 *
 * - **SINGLE 答案校验**(Requirement 12.2)
 *   - 正向:任意 1 位大写 `[A-F]` 答案 + 含对应非空选项的 payload → `{ ok: true }`。
 *   - 反向:`answer` 字符集 / 长度违规 → `INVALID_ANSWER_FORMAT`;
 *           对应选项缺失或文本为空 → `OPTION_MISSING_FOR_ANSWER`。
 *
 * - **MULTI 答案校验**(Requirement 12.3)
 *   - 正向:任意 2~6 位升序去重的 `[A-F]` 子集 + 全部选项非空 → `{ ok: true }`。
 *   - 反向:长度 < 2 / 含非 `[A-F]` 字符 → `INVALID_ANSWER_FORMAT`;
 *           非严格升序或有重复 → `MULTI_NOT_ASCENDING`;
 *           引用了缺失/空文本选项 → `OPTION_MISSING_FOR_ANSWER`。
 *
 * - **JUDGE 答案校验**(Requirement 12.4)
 *   - 正向:`options` 严格等于 `[{T:'正确'},{F:'错误'}]` 且 `answer ∈ {T, F}` → `{ ok: true }`。
 *   - 反向:`options` 形态偏离 → `JUDGE_OPTIONS_INVALID`;
 *           `answer` 不在 `{T, F}` → `JUDGE_ANSWER_INVALID`。
 *
 * **Validates: Requirements 12.2, 12.3, 12.4**
 *
 * 测试框架:Vitest + fast-check(Requirement 29.1 / 29.2)。
 * `numRuns` 统一 200,优于设计文档要求的 100。
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
    ERR_INVALID_ANSWER_FORMAT,
    ERR_JUDGE_ANSWER_INVALID,
    ERR_JUDGE_OPTIONS_INVALID,
    ERR_MULTI_NOT_ASCENDING,
    ERR_OPTION_MISSING_FOR_ANSWER,
    validateQuestionPayload,
    type QuestionOption,
    type QuestionPayload,
} from '@/lib/question-validate';

const NUM_RUNS = 200;

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
type Letter = (typeof LETTERS)[number];

// ============================================================
// 通用 arbitrary
// ============================================================

/** 非空选项文本(去空白后长度 ≥ 1)。 */
const nonEmptyText = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => s.trim().length > 0);

/** 全空白文本(`text.trim()` 为空,模拟"存在但内容为空"的选项)。 */
const blankText = fc
  .string({ minLength: 0, maxLength: 4 })
  .map((s) => s.replace(/\S/g, ' '));

/**
 * 给定一组字母,生成"全部存在且文本非空"的选项数组。
 *
 * 输出顺序按字母升序;每位选项的文本由独立的 `nonEmptyText` 抽样得到。
 */
function arbOptionsForLetters(
  letters: ReadonlyArray<string>,
): fc.Arbitrary<QuestionOption[]> {
  const sorted = [...new Set(letters)].sort();
  if (sorted.length === 0) return fc.constant<QuestionOption[]>([]);
  return fc
    .tuple(...sorted.map(() => nonEmptyText))
    .map((texts) => sorted.map((key, i) => ({ key, text: texts[i] as string })));
}

/** 始终给齐 [A-F] 全部 6 位非空选项的 arbitrary,排除选项缺失干扰。 */
const arbAllSixOptions = arbOptionsForLetters([...LETTERS]);

// ============================================================
// SINGLE
// ============================================================

/** 合法 SINGLE 用例:1 位 [A-F] answer + 含对应非空选项的 options。 */
const arbValidSinglePayload: fc.Arbitrary<QuestionPayload> = fc
  .tuple(
    fc.constantFrom<Letter>(...LETTERS),
    fc.subarray([...LETTERS], { minLength: 0, maxLength: LETTERS.length }),
  )
  .chain(([answer, extras]) => {
    const all = Array.from(new Set<string>([answer, ...extras]));
    return arbOptionsForLetters(all).map<QuestionPayload>((options) => ({
      type: 'SINGLE',
      content: 'q',
      options,
      answer,
    }));
  });

/** 任意"不是单个 [A-F] 字母"的字符串(包括小写、数字、空串、多字符)。 */
const arbBadSingleAnswer = fc
  .string({ minLength: 0, maxLength: 4 })
  .filter((s) => !/^[A-F]$/.test(s));

/** SINGLE: answer 格式非法的 payload(选项随便给齐,排除选项缺失干扰)。 */
const arbSingleInvalidFormatPayload: fc.Arbitrary<QuestionPayload> = fc
  .tuple(arbBadSingleAnswer, arbAllSixOptions)
  .map<QuestionPayload>(([answer, options]) => ({
    type: 'SINGLE',
    content: 'q',
    options,
    answer,
  }));

/**
 * SINGLE: answer 引用的选项缺失或文本为空白。
 *
 * - `missing=true` :answer 字母完全不在 options 中。
 * - `missing=false`:answer 字母存在但 text 全为空白字符。
 */
const arbSingleOptionMissingPayload: fc.Arbitrary<QuestionPayload> = fc
  .tuple(fc.constantFrom<Letter>(...LETTERS), fc.boolean(), blankText)
  .chain(([answer, missing, blank]) => {
    const others = LETTERS.filter((l) => l !== answer);
    return arbOptionsForLetters(others).map<QuestionPayload>((otherOptions) => ({
      type: 'SINGLE',
      content: 'q',
      options: missing
        ? otherOptions
        : [...otherOptions, { key: answer, text: blank }],
      answer,
    }));
  });

describe('validateQuestionPayload — SINGLE (Requirement 12.2)', () => {
  it('合法 SINGLE payload 始终通过', () => {
    // Validates: Requirements 12.2
    fc.assert(
      fc.property(arbValidSinglePayload, (payload) => {
        expect(validateQuestionPayload(payload)).toEqual({ ok: true });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('answer 字符集/长度非法 → INVALID_ANSWER_FORMAT', () => {
    // Validates: Requirements 12.2
    fc.assert(
      fc.property(arbSingleInvalidFormatPayload, (payload) => {
        const result = validateQuestionPayload(payload);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toContain(ERR_INVALID_ANSWER_FORMAT);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('answer 引用的选项缺失/空文本 → OPTION_MISSING_FOR_ANSWER', () => {
    // Validates: Requirements 12.2
    fc.assert(
      fc.property(arbSingleOptionMissingPayload, (payload) => {
        const result = validateQuestionPayload(payload);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toContain(ERR_OPTION_MISSING_FOR_ANSWER);
          // answer 本身合法,不应触发格式错
          expect(result.errors).not.toContain(ERR_INVALID_ANSWER_FORMAT);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ============================================================
// MULTI
// ============================================================

/**
 * 长度 2..6 的 [A-F] 升序去重子集(即合法 MULTI answer 字母序列)。
 *
 * `fc.subarray` 在保留原数组顺序前提下抽取子序列,因 `LETTERS` 已是升序,
 * 返回的子数组天然升序无重复。
 */
const arbAscendingMultiLetters: fc.Arbitrary<Letter[]> = fc.subarray(
  [...LETTERS],
  { minLength: 2, maxLength: LETTERS.length },
);

/** 合法 MULTI 用例:升序去重 [A-F] 子集 + 各字母选项非空。 */
const arbValidMultiPayload: fc.Arbitrary<QuestionPayload> = arbAscendingMultiLetters.chain(
  (letters) =>
    arbOptionsForLetters(letters).map<QuestionPayload>((options) => ({
      type: 'MULTI',
      content: 'q',
      options,
      answer: letters.join(''),
    })),
);

/** MULTI: answer 长度 < 2(0 或 1 位的 [A-F] 字符)。 */
const arbMultiShortAnswerPayload: fc.Arbitrary<QuestionPayload> = fc
  .tuple(
    fc.oneof(
      fc.constant(''),
      fc.constantFrom<Letter>(...LETTERS).map((c) => c as string),
    ),
    arbAllSixOptions,
  )
  .map<QuestionPayload>(([answer, options]) => ({
    type: 'MULTI',
    content: 'q',
    options,
    answer,
  }));

/** MULTI: answer 含非 [A-F] 字符(长度 ≥ 2,排除"长度太短"分支)。 */
const arbMultiNonRangeAnswerPayload: fc.Arbitrary<QuestionPayload> = fc
  .tuple(
    fc.array(fc.constantFrom<Letter>(...LETTERS), { minLength: 1, maxLength: 4 }),
    fc
      .string({ minLength: 1, maxLength: 3 })
      .filter((s) => [...s].every((c) => !/[A-F]/.test(c))),
    arbAllSixOptions,
  )
  .map<QuestionPayload>(([validPart, invalidPart, options]) => ({
    type: 'MULTI',
    content: 'q',
    options,
    answer: validPart.join('') + invalidPart,
  }));

/**
 * MULTI: answer 全部由 [A-F] 字符构成、长度 ≥ 2,但**非严格升序或有重复**。
 *
 * 通过对一个升序合法序列做"局部破坏"得到反例,确保 `INVALID_ANSWER_FORMAT`
 * 不会被触发,从而能干净地断言 `MULTI_NOT_ASCENDING`。
 */
const arbMultiNotAscendingPayload: fc.Arbitrary<QuestionPayload> = arbAscendingMultiLetters
  .chain((letters) =>
    fc
      .oneof(
        // (a) 重复某字母:在某位置插入相同字母
        fc.integer({ min: 0, max: letters.length - 1 }).map((idx) => {
          const out = [...letters];
          out.splice(idx, 0, letters[idx] as Letter);
          return out;
        }),
        // (b) 反转(长度 ≥ 2 时必降序)
        fc.constant([...letters].reverse()),
        // (c) 交换两个相邻字母,破坏升序
        fc.integer({ min: 0, max: letters.length - 2 }).map((idx) => {
          const out = [...letters];
          const a = out[idx] as Letter;
          const b = out[idx + 1] as Letter;
          out[idx] = b;
          out[idx + 1] = a;
          return out;
        }),
      )
      .filter((arr) => {
        // 过滤掉偶然仍升序无重复的情况
        for (let i = 1; i < arr.length; i++) {
          const prev = arr[i - 1] as string;
          const curr = arr[i] as string;
          if (prev >= curr) return true;
        }
        return false;
      }),
  )
  .map<QuestionPayload>((broken) => ({
    type: 'MULTI',
    content: 'q',
    // 选项给齐 [A-F] 全部非空,排除 OPTION_MISSING_FOR_ANSWER 干扰
    options: LETTERS.map((k) => ({ key: k, text: `opt-${k}` })),
    answer: broken.join(''),
  }));

/**
 * MULTI: answer 合法(升序去重 [A-F] 长度 ≥ 2),但其中一位字母对应的选项
 * 缺失或文本为空白。
 */
const arbMultiOptionMissingPayload: fc.Arbitrary<QuestionPayload> = fc
  .tuple(arbAscendingMultiLetters, fc.nat(), fc.boolean(), blankText)
  .chain(([letters, rawIdx, missing, blank]) => {
    const idx = rawIdx % letters.length;
    const target = letters[idx] as Letter;
    const others = letters.filter((l) => l !== target);
    return arbOptionsForLetters(others).map<QuestionPayload>((otherOptions) => ({
      type: 'MULTI',
      content: 'q',
      options: missing
        ? otherOptions
        : [...otherOptions, { key: target, text: blank }],
      answer: letters.join(''),
    }));
  });

describe('validateQuestionPayload — MULTI (Requirement 12.3)', () => {
  it('合法 MULTI payload(2..6 位升序去重 [A-F])始终通过', () => {
    // Validates: Requirements 12.3
    fc.assert(
      fc.property(arbValidMultiPayload, (payload) => {
        expect(validateQuestionPayload(payload)).toEqual({ ok: true });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('answer 长度 < 2 → INVALID_ANSWER_FORMAT', () => {
    // Validates: Requirements 12.3
    fc.assert(
      fc.property(arbMultiShortAnswerPayload, (payload) => {
        const result = validateQuestionPayload(payload);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toContain(ERR_INVALID_ANSWER_FORMAT);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('answer 含非 [A-F] 字符 → INVALID_ANSWER_FORMAT', () => {
    // Validates: Requirements 12.3
    fc.assert(
      fc.property(arbMultiNonRangeAnswerPayload, (payload) => {
        const result = validateQuestionPayload(payload);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toContain(ERR_INVALID_ANSWER_FORMAT);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('answer 非严格升序或有重复 → MULTI_NOT_ASCENDING', () => {
    // Validates: Requirements 12.3
    fc.assert(
      fc.property(arbMultiNotAscendingPayload, (payload) => {
        const result = validateQuestionPayload(payload);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toContain(ERR_MULTI_NOT_ASCENDING);
          // answer 全 [A-F] 且长度 ≥ 2,不应触发格式错
          expect(result.errors).not.toContain(ERR_INVALID_ANSWER_FORMAT);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('answer 引用的选项缺失/空文本 → OPTION_MISSING_FOR_ANSWER', () => {
    // Validates: Requirements 12.3
    fc.assert(
      fc.property(arbMultiOptionMissingPayload, (payload) => {
        const result = validateQuestionPayload(payload);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toContain(ERR_OPTION_MISSING_FOR_ANSWER);
          // answer 本身合法,不应触发其它 answer 相关错误码
          expect(result.errors).not.toContain(ERR_INVALID_ANSWER_FORMAT);
          expect(result.errors).not.toContain(ERR_MULTI_NOT_ASCENDING);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ============================================================
// JUDGE
// ============================================================

/** JUDGE 题型强制的固定 options 形态(深拷贝以避免被外部修改)。 */
function makeExactJudgeOptions(): QuestionOption[] {
  return [
    { key: 'T', text: '正确' },
    { key: 'F', text: '错误' },
  ];
}

/** 合法 JUDGE payload:固定 options + answer ∈ {T, F}。 */
const arbValidJudgePayload: fc.Arbitrary<QuestionPayload> = fc
  .constantFrom('T', 'F')
  .map<QuestionPayload>((answer) => ({
    type: 'JUDGE',
    content: 'q',
    options: makeExactJudgeOptions(),
    answer,
  }));

/**
 * 偏离固定形态的 JUDGE options。涵盖:
 *  (a) 数量不等(0/1/3+)
 *  (b) 顺序颠倒
 *  (c) key 错误
 *  (d) text 错误(空串、英文 True/False、其它中文)
 */
const arbWrongJudgeOptions: fc.Arbitrary<QuestionOption[]> = fc.oneof(
  fc.constant<QuestionOption[]>([]),
  fc.constant<QuestionOption[]>([{ key: 'T', text: '正确' }]),
  fc.constant<QuestionOption[]>([
    { key: 'T', text: '正确' },
    { key: 'F', text: '错误' },
    { key: 'X', text: '其它' },
  ]),
  fc.constant<QuestionOption[]>([
    { key: 'F', text: '错误' },
    { key: 'T', text: '正确' },
  ]),
  fc.constant<QuestionOption[]>([
    { key: 'A', text: '正确' },
    { key: 'B', text: '错误' },
  ]),
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 4 }).filter((s) => s !== '正确'),
      fc.string({ minLength: 1, maxLength: 4 }).filter((s) => s !== '错误'),
    )
    .map<QuestionOption[]>(([t, f]) => [
      { key: 'T', text: t },
      { key: 'F', text: f },
    ]),
);

/** JUDGE: options 偏离固定形态,但 answer 保持合法(只触发 OPTIONS_INVALID)。 */
const arbJudgeWrongOptionsPayload: fc.Arbitrary<QuestionPayload> = fc
  .tuple(arbWrongJudgeOptions, fc.constantFrom('T', 'F'))
  .map<QuestionPayload>(([options, answer]) => ({
    type: 'JUDGE',
    content: 'q',
    options,
    answer,
  }));

/** JUDGE: answer ∉ {T, F},但 options 保持合法(只触发 ANSWER_INVALID)。 */
const arbJudgeWrongAnswerPayload: fc.Arbitrary<QuestionPayload> = fc
  .string({ maxLength: 4 })
  .filter((s) => s !== 'T' && s !== 'F')
  .map<QuestionPayload>((answer) => ({
    type: 'JUDGE',
    content: 'q',
    options: makeExactJudgeOptions(),
    answer,
  }));

describe('validateQuestionPayload — JUDGE (Requirement 12.4)', () => {
  it('合法 JUDGE payload(固定 options + T/F 答案)始终通过', () => {
    // Validates: Requirements 12.4
    fc.assert(
      fc.property(arbValidJudgePayload, (payload) => {
        expect(validateQuestionPayload(payload)).toEqual({ ok: true });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('options 偏离固定形态 → JUDGE_OPTIONS_INVALID', () => {
    // Validates: Requirements 12.4
    fc.assert(
      fc.property(arbJudgeWrongOptionsPayload, (payload) => {
        const result = validateQuestionPayload(payload);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toContain(ERR_JUDGE_OPTIONS_INVALID);
          // answer 合法,不应触发 ANSWER_INVALID
          expect(result.errors).not.toContain(ERR_JUDGE_ANSWER_INVALID);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('answer 不在 {T, F} → JUDGE_ANSWER_INVALID', () => {
    // Validates: Requirements 12.4
    fc.assert(
      fc.property(arbJudgeWrongAnswerPayload, (payload) => {
        const result = validateQuestionPayload(payload);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors).toContain(ERR_JUDGE_ANSWER_INVALID);
          // options 合法,不应触发 OPTIONS_INVALID
          expect(result.errors).not.toContain(ERR_JUDGE_OPTIONS_INVALID);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
