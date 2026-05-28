/**
 * Property-based tests for `src/lib/exam-engine/judger.ts`.
 *
 * Validates the engine-layer invariants that guard answer comparison,
 * submittability and cost-time clamping behaviour:
 *
 * - **Property 7 (CP-7): `compareAnswer` 答案语义**
 *   SINGLE / JUDGE 等价于 normalize 后字符串相等;
 *   MULTI 任意排列输入 correctAnswer 都返回 true,不等集合返回 false。
 *
 * - **Property 11 (CP-11): `isSubmittable` 真值表**
 *   SINGLE / JUDGE 等价于 `selectedCount === 1`;
 *   MULTI 等价于 `2 <= selectedCount <= optionsCount`;
 *   非法 type 返回 false。
 *
 * - **clampCostMs 闭区间**
 *   对任意输入(NaN / ±Infinity / 负数 / 巨大数 / 普通数),输出始终为
 *   `[0, 3_600_000]` 区间内的有限整数。
 *
 * **Validates: Requirements 19.2, 19.3, 19.4**
 *
 * 测试框架:Vitest + fast-check(Requirement 29.1 / 29.2)。
 * `numRuns` 统一 200,优于设计文档要求的 100。
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
    clampCostMs,
    compareAnswer,
    isSubmittable,
    normalizeAnswer,
    type QuestionType,
} from '@/lib/exam-engine/judger';

const NUM_RUNS = 200;

const COST_MS_MAX = 3_600_000;

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** 用于 MULTI 的字母字符集(`A`..`F`),与题库选项域对齐。 */
const letterChar = fc.constantFrom(...LETTERS);

/** 任意题型 */
const questionType: fc.Arbitrary<QuestionType> = fc.constantFrom(
  'SINGLE',
  'MULTI',
  'JUDGE',
);

/**
 * 生成一个 MULTI 正确答案集 + 它的一个随机排列。
 *
 * 通过 `fc.shuffledSubarray(letters, { minLength, maxLength })` 取
 * 相同长度的子序列,即得到一个排列。
 */
const multiSetAndPermutation = fc
  .subarray([...LETTERS], { minLength: 1, maxLength: LETTERS.length })
  .chain((letters) =>
    fc.tuple(
      fc.constant(letters),
      fc.shuffledSubarray(letters, {
        minLength: letters.length,
        maxLength: letters.length,
      }),
    ),
  );

/**
 * 生成两个"集合不等"的字母子集 `[a, b]`,用于反例:`compareAnswer` 必须返回 false。
 */
const multiTwoUnequalSets = fc
  .tuple(
    fc.subarray([...LETTERS], { minLength: 1, maxLength: LETTERS.length }),
    fc.subarray([...LETTERS], { minLength: 1, maxLength: LETTERS.length }),
  )
  .filter(([a, b]) => {
    // 集合不等 ⇔ 规范化后的字符串不等
    const na = Array.from(new Set(a)).sort().join('');
    const nb = Array.from(new Set(b)).sort().join('');
    return na !== nb;
  });

/**
 * 任意"看起来像数字但可能是脏值"的输入,用于 clampCostMs 健壮性测试。
 */
const dirtyNumber = fc.oneof(
  // 普通有限浮点(也覆盖 NaN / ±Infinity 通过下面的 constantFrom)
  fc.double({ noDefaultInfinity: false, noNaN: false }),
  fc.integer(),
  fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0,
    -0,
    -1,
    -1_000_000,
    COST_MS_MAX,
    COST_MS_MAX - 1,
    COST_MS_MAX + 1,
    COST_MS_MAX * 2,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
  ),
);

describe('judger.compareAnswer (Property 7 / CP-7)', () => {
  it('SINGLE/JUDGE 等价于 normalize 后字符串相等', () => {
    // Validates: Requirements 19.2
    fc.assert(
      fc.property(
        fc.constantFrom<QuestionType>('SINGLE', 'JUDGE'),
        fc.string(),
        fc.string(),
        (type, user, correct) => {
          const expected =
            normalizeAnswer(type, user) === normalizeAnswer(type, correct);
          expect(compareAnswer(type, user, correct)).toBe(expected);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('MULTI 任意排列输入 correctAnswer 都返回 true', () => {
    // Validates: Requirements 19.2
    fc.assert(
      fc.property(
        multiSetAndPermutation,
        // 允许在排列字符之间插入任意空白字符,验证 normalize 一并去空白
        fc.array(fc.constantFrom(' ', '\t', '\n', ''), {
          minLength: 0,
          maxLength: 8,
        }),
        ([correctLetters, permutedLetters], whitespace) => {
          // 把任意空白随机交错进字符序列
          const interleaved: string[] = [];
          for (let i = 0; i < permutedLetters.length; i += 1) {
            interleaved.push(whitespace[i % whitespace.length] ?? '');
            interleaved.push(permutedLetters[i] as string);
          }
          interleaved.push(whitespace[whitespace.length - 1] ?? '');
          const userAnswer = interleaved.join('');
          const correctAnswer = correctLetters.join('');

          expect(compareAnswer('MULTI', userAnswer, correctAnswer)).toBe(true);
          // 对称性:交换两端仍然 true
          expect(compareAnswer('MULTI', correctAnswer, userAnswer)).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('MULTI 不等集合返回 false', () => {
    // Validates: Requirements 19.2
    fc.assert(
      fc.property(multiTwoUnequalSets, ([a, b]) => {
        expect(compareAnswer('MULTI', a.join(''), b.join(''))).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('judger.isSubmittable (Property 11 / CP-11)', () => {
  it('SINGLE/JUDGE 等价于 selectedCount === 1', () => {
    // Validates: Requirements 19.3
    fc.assert(
      fc.property(
        fc.constantFrom<QuestionType>('SINGLE', 'JUDGE'),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (type, selectedCount, optionsCount) => {
          expect(isSubmittable(type, selectedCount, optionsCount)).toBe(
            selectedCount === 1,
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('MULTI 等价于 2 <= selectedCount <= optionsCount', () => {
    // Validates: Requirements 19.3
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (selectedCount, optionsCount) => {
          const expected = selectedCount >= 2 && selectedCount <= optionsCount;
          expect(isSubmittable('MULTI', selectedCount, optionsCount)).toBe(
            expected,
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('非法 type 始终返回 false', () => {
    // Validates: Requirements 19.3
    fc.assert(
      fc.property(
        fc
          .string()
          // 排除合法 type;空串、'INVALID'、'single'(小写)、随机串等都应返回 false
          .filter(
            (s) => s !== 'SINGLE' && s !== 'MULTI' && s !== 'JUDGE',
          ),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (badType, selectedCount, optionsCount) => {
          expect(
            // 故意绕过类型系统检测运行时兜底分支
            isSubmittable(
              badType as unknown as QuestionType,
              selectedCount,
              optionsCount,
            ),
          ).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('judger.clampCostMs', () => {
  it('输出始终是 [0, 3_600_000] 区间内的有限整数', () => {
    // Validates: Requirements 19.4
    fc.assert(
      fc.property(dirtyNumber, (value) => {
        const out = clampCostMs(value);
        expect(Number.isFinite(out)).toBe(true);
        expect(Number.isInteger(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(COST_MS_MAX);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('NaN / ±Infinity / 非数值输入返回 0', () => {
    // Sanity check on the documented fast-path; complements the property above.
    expect(clampCostMs(Number.NaN)).toBe(0);
    expect(clampCostMs(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampCostMs(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('已在 [0, 3_600_000] 区间内的有限整数保持不变(取整)', () => {
    // Validates: Requirements 19.4
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: COST_MS_MAX }),
        (value) => {
          expect(clampCostMs(value)).toBe(value);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
