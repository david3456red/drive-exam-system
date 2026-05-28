/**
 * Exam Engine - Judger 模块
 *
 * 职责:答案规范化、答案比对、可提交判定、耗时钳制。
 *
 * 本模块为纯函数零依赖,直接被 PBT 测试覆盖以下不变量:
 * - CP-6: submitAnswer 写入的 ExamRecord.userAnswer = normalizeAnswer(...)
 * - CP-7: compareAnswer 语义(SINGLE/JUDGE 字符串相等;MULTI 集合相等)
 * - CP-11: isSubmittable 真值表
 * - clampCostMs 输出始终在 [0, 3_600_000] 闭区间
 *
 * 详见 docs/TECHNICAL.md「答题引擎」、Requirement 19、design.md `judger.ts 接口` 节。
 */

import type { QuestionType } from '@/lib/enums';

export type { QuestionType };

/** 单题作答耗时上限:1 小时(毫秒) */
const COST_MS_MAX = 3_600_000;

/**
 * 规范化答案字符串。
 *
 * 行为:
 * - 去除全部空白字符,转换为大写。
 * - 若 type=MULTI,把字符拆开,按升序去重后再拼接。
 *
 * 不做合法字母校验(`A-F` / `T` / `F` 等约束由 question-validate 模块负责)。
 *
 * @param type 题型
 * @param raw  用户原始输入或题库存储的正确答案
 * @returns 规范化后的答案字符串
 */
export function normalizeAnswer(type: QuestionType, raw: string): string {
  // 去除全部空白(不仅是首尾)并转大写
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();

  if (type !== 'MULTI') {
    return cleaned;
  }

  // MULTI:拆字符 → 升序 → 去重 → 拼接
  const chars = cleaned.split('');
  // 用 Set 去重后排序,保证 'BCA' 与 'CBA' 与 'AABC' 都规范化为 'ABC'
  const unique = Array.from(new Set(chars));
  unique.sort();
  return unique.join('');
}

/**
 * 比对用户答案与正确答案是否一致。
 *
 * 行为:
 * - 两端都先 `normalizeAnswer` 再比较。
 * - SINGLE / JUDGE:规范化后字符串相等。
 * - MULTI:规范化后字符串相等(因 normalize 已排序去重,等价于集合相等)。
 *
 * @param type          题型
 * @param userAnswer    用户提交的答案
 * @param correctAnswer 题库存储的正确答案
 * @returns 是否答对
 */
export function compareAnswer(
  type: QuestionType,
  userAnswer: string,
  correctAnswer: string,
): boolean {
  const normalizedUser = normalizeAnswer(type, userAnswer);
  const normalizedCorrect = normalizeAnswer(type, correctAnswer);
  return normalizedUser === normalizedCorrect;
}

/**
 * 判定当前选项数是否构成可提交的答题状态。
 *
 * - SINGLE / JUDGE:必须恰好选 1 项。
 * - MULTI:必须选 2 ~ optionsCount 项(多选题不允许仅选 1 项)。
 * - 其它非法 type:返回 false。
 *
 * 同时对 selectedCount / optionsCount 做基本健壮性兜底:
 * 非有限数返回 false。
 *
 * @param type           题型
 * @param selectedCount  当前已勾选的选项数
 * @param optionsCount   该题目可选项总数
 */
export function isSubmittable(
  type: QuestionType,
  selectedCount: number,
  optionsCount: number,
): boolean {
  if (!Number.isFinite(selectedCount) || !Number.isFinite(optionsCount)) {
    return false;
  }

  switch (type) {
    case 'SINGLE':
    case 'JUDGE':
      return selectedCount === 1;
    case 'MULTI':
      return selectedCount >= 2 && selectedCount <= optionsCount;
    default:
      // 非法 type 兜底,满足 CP-11 第 3 项
      return false;
  }
}

/**
 * 钳制单题作答耗时到合法范围 `[0, 3_600_000]` 毫秒,并取整。
 *
 * 行为:
 * - 用 `Number.isFinite` 判定;NaN / Infinity / 非数值类型 → 返回 0。
 * - 否则返回 `Math.floor(max(0, min(value, 3_600_000)))`,保证为整数。
 *
 * 该函数在 `submitAnswer` 写入 `ExamRecord.costMs` 之前调用,
 * 防止前端篡改导致的脏值入库(Requirement 19.6 / CP-6)。
 *
 * @param value 客户端上报的耗时(毫秒)
 * @returns 钳制后的整数耗时
 */
export function clampCostMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(value, COST_MS_MAX));
  return Math.floor(clamped);
}
