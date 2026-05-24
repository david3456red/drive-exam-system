/**
 * Feature: exam-modes — Shared arbitraries
 *
 * 集中维护 exam-modes 属性测试使用的 fast-check generators(Arbitraries)。
 * 这些生成器与 Prisma `Question` / `Category` / `WrongQuestion` 模型保持字段一致,
 * 以便在 examEngine 纯函数与 Server Action 的属性测试中复用。
 *
 * 约定:
 *   - 选项字母仅取 A-F(覆盖驾考真题常见的 4-6 选项情况)。
 *   - SINGLE / JUDGE 答案为单个字符,MULTI 答案为升序去重后的 2+ 字母拼接。
 *   - JUDGE 题 `options` 为空数组(序列化为 "[]"),与 Prisma schema 注释一致。
 *   - 时间字段使用 `Date` 对象;调用方若需 Prisma JSON 字段可自行 stringify。
 */
import * as fc from 'fast-check';

import { QUESTION_TYPES, type QuestionOption, type QuestionType } from '@/lib/question-types';

// ---------------------------------------------------------------------------
// Primitive arbitraries
// ---------------------------------------------------------------------------

/** SINGLE / MULTI / JUDGE 题型。 */
export const arbQuestionType: fc.Arbitrary<QuestionType> = fc.constantFrom(
  ...(QUESTION_TYPES as readonly QuestionType[]),
);

/** 选项字母 A-F。 */
export const arbOptionLetter: fc.Arbitrary<string> = fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F');

/** cuid 风格的 id(测试场景下保证唯一即可,不强求与生产格式一致)。 */
const arbId: fc.Arbitrary<string> = fc
  .uuid({ version: 4 })
  .map((u: string) => `c_${u.replace(/-/g, '')}`);

/** 一段非空文本,用作题干 / 选项文本 / 解析等。 */
const arbText = (minLength = 1, maxLength = 40): fc.Arbitrary<string> =>
  fc
    .string({ minLength, maxLength })
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= minLength);

// ---------------------------------------------------------------------------
// Answer arbitraries
// ---------------------------------------------------------------------------

/**
 * 根据题型产生一个合法的"已规范化"答案串:
 *   - SINGLE: 单个 A-F 字母
 *   - JUDGE:  "T" 或 "F"
 *   - MULTI:  2-6 个不同字母,按升序拼接(如 "AC"、"BCD")
 */
export function arbAnswerForType(type: QuestionType): fc.Arbitrary<string> {
  switch (type) {
    case 'SINGLE':
      return arbOptionLetter;
    case 'JUDGE':
      return fc.constantFrom('T', 'F');
    case 'MULTI':
      return fc
        .uniqueArray(arbOptionLetter, { minLength: 2, maxLength: 6 })
        .map((letters) => [...letters].sort().join(''));
  }
}

// ---------------------------------------------------------------------------
// Question arbitrary
// ---------------------------------------------------------------------------

/**
 * 返回与 Prisma `Question` 模型对齐的对象。
 *
 * 字段说明:
 *   - `options` 为 JSON 字符串(与 DB 列保持一致),内部数组按 `key` 升序;JUDGE 题为 "[]"
 *   - `answer` 与 `options` 相互一致(MULTI/SINGLE 答案中的字母全部出现在 options 的 key 中)
 *   - `bankId` 用占位 id;调用方可在测试中显式覆盖以匹配自有夹具
 *   - `createdAt` / `updatedAt` 在 Unix epoch 之后,便于排序断言
 */
export interface ArbitraryQuestion {
  id: string;
  bankId: string;
  type: QuestionType;
  content: string;
  imageUrl: string | null;
  /** JSON.stringify 后的 `QuestionOption[]`(JUDGE 时为 "[]") */
  options: string;
  /** 已规范化:大写、MULTI 升序拼接 */
  answer: string;
  explanation: string | null;
  tags: string;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const arbCreatedAt: fc.Arbitrary<Date> = fc
  .integer({ min: 0, max: 4_102_444_800_000 }) // [1970-01-01, 2100-01-01)
  .map((ms) => new Date(ms));

function buildOptionList(letters: string[]): QuestionOption[] {
  return letters
    .slice()
    .sort()
    .map((key, idx) => ({ key, text: `选项 ${key}-${idx + 1}` }));
}

const arbSingleOrMultiQuestion = (type: 'SINGLE' | 'MULTI'): fc.Arbitrary<ArbitraryQuestion> =>
  fc
    .uniqueArray(arbOptionLetter, { minLength: 2, maxLength: 6 })
    .chain((optionLetters) => {
      const sorted = [...optionLetters].sort();
      const answerArb =
        type === 'SINGLE'
          ? fc.constantFrom(...sorted).map((c) => c)
          : fc
              .uniqueArray(fc.constantFrom(...sorted), {
                minLength: 2,
                maxLength: sorted.length,
              })
              .map((letters) => [...letters].sort().join(''));

      return fc.record({
        id: arbId,
        bankId: arbId,
        type: fc.constant(type),
        content: arbText(2, 60),
        imageUrl: fc.option(fc.webUrl(), { nil: null }),
        options: fc.constant(JSON.stringify(buildOptionList(sorted))),
        answer: answerArb,
        explanation: fc.option(arbText(0, 80), { nil: null }),
        tags: fc.constant(''),
        source: fc.option(arbText(0, 20), { nil: null }),
        createdAt: arbCreatedAt,
        updatedAt: arbCreatedAt,
      });
    });

const arbJudgeQuestion: fc.Arbitrary<ArbitraryQuestion> = fc.record({
  id: arbId,
  bankId: arbId,
  type: fc.constant<QuestionType>('JUDGE'),
  content: arbText(2, 60),
  imageUrl: fc.option(fc.webUrl(), { nil: null }),
  options: fc.constant('[]'),
  answer: fc.constantFrom('T', 'F'),
  explanation: fc.option(arbText(0, 80), { nil: null }),
  tags: fc.constant(''),
  source: fc.option(arbText(0, 20), { nil: null }),
  createdAt: arbCreatedAt,
  updatedAt: arbCreatedAt,
});

/** 任意题型的合法 Question(字段相互一致)。 */
export const arbQuestion: fc.Arbitrary<ArbitraryQuestion> = fc.oneof(
  arbSingleOrMultiQuestion('SINGLE'),
  arbSingleOrMultiQuestion('MULTI'),
  arbJudgeQuestion,
);

// ---------------------------------------------------------------------------
// Category tree arbitrary
// ---------------------------------------------------------------------------

export interface ArbitraryCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: Date;
}

/**
 * 产生扁平化的分类列表(模拟 Prisma 自关联 `Category.parentId` 树)。
 * 第 1 层 parentId=null,后续层级随机选取上一层节点作为父节点。
 *
 * @param maxDepth 树的最大深度,默认 3。深度 1 = 仅根节点。
 */
export function arbCategoryTree(maxDepth = 3): fc.Arbitrary<ArbitraryCategory[]> {
  if (maxDepth < 1) {
    return fc.constant<ArbitraryCategory[]>([]);
  }
  return fc
    .integer({ min: 1, max: maxDepth })
    .chain((depth) =>
      fc
        .array(
          fc.record({
            level: fc.integer({ min: 0, max: depth - 1 }),
            id: arbId,
            name: arbText(1, 12),
            sortOrder: fc.integer({ min: 0, max: 99 }),
            createdAt: arbCreatedAt,
          }),
          { minLength: 1, maxLength: 12 },
        )
        .map((rawNodes) => {
          // 保证每层至少 1 个节点:把第一个节点强制放到 level 0。
          if (rawNodes.length > 0) {
            rawNodes[0] = { ...rawNodes[0], level: 0 };
          }
          // 按 level 分桶,逐层挂接父节点。
          const byLevel: Record<number, ArbitraryCategory[]> = {};
          const result: ArbitraryCategory[] = [];
          for (const node of rawNodes) {
            const level = Math.min(node.level, depth - 1);
            const parentBucket = byLevel[level - 1];
            const parentId =
              level === 0 || !parentBucket || parentBucket.length === 0
                ? null
                : parentBucket[parentBucket.length === 1 ? 0 : node.sortOrder % parentBucket.length].id;
            const cat: ArbitraryCategory = {
              id: node.id,
              name: node.name,
              parentId,
              sortOrder: node.sortOrder,
              createdAt: node.createdAt,
            };
            (byLevel[level] ||= []).push(cat);
            result.push(cat);
          }
          return result;
        }),
    );
}

// ---------------------------------------------------------------------------
// WrongQuestion state arbitrary
// ---------------------------------------------------------------------------

/**
 * `WrongQuestion` 的状态切片(不含 id / 关联),与 examEngine `WrongState` 类型对齐。
 * 覆盖 mastered/not-mastered + rightCount 0~3 的所有组合。
 */
export interface ArbitraryWrongState {
  wrongCount: number;
  rightCount: number;
  mastered: boolean;
  lastWrongAt: Date;
}

/**
 * 覆盖以下组合:
 *   - mastered = false, rightCount ∈ {0, 1, 2}
 *   - mastered = true,  rightCount ∈ {3+}(已掌握至少需要 3 次)
 *   - 同时也允许 mastered=true 且 rightCount<3(模拟用户手动标记掌握的场景)
 */
export const arbWrongQuestionState: fc.Arbitrary<ArbitraryWrongState> = fc
  .record({
    wrongCount: fc.integer({ min: 1, max: 20 }),
    rightCount: fc.integer({ min: 0, max: 5 }),
    mastered: fc.boolean(),
    lastWrongAt: arbCreatedAt,
  })
  .map(({ wrongCount, rightCount, mastered, lastWrongAt }) => ({
    wrongCount,
    rightCount,
    // 若 rightCount >= 3 则状态机里通常 mastered=true,但允许独立组合以测试边界。
    mastered,
    lastWrongAt,
  }));
