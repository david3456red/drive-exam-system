/**
 * 答题模式 (Exam Modes) - 答案判定与提交可用性 (judger)
 *
 * 本模块集中维护与"判分"相关的纯函数,包括:
 *
 * - `normalizeAnswer`:把用户/题目答案规范化为可直接比较的形式
 *   (去除所有空白字符、统一大写;MULTI 题按字母升序去重)。
 * - `compareAnswer`:对规范化后的两个答案做语义比较;SINGLE / JUDGE
 *   做字符串相等比较,MULTI 由于规范化已升序去重,字符串相等即集合相等。
 * - `isSubmittable`:根据题型、已选选项数量、总选项数量判定"提交"
 *   按钮是否可用,对应需求 12.2/12.3/12.4/12.5。
 * - `clampCostMs`:把答题耗时钳制到合法区间 `[0, 3_600_000]`,
 *   处理 NaN / 负数 / 超上限三种异常输入。
 *
 * 全部为纯函数,无任何 I/O 与外部依赖,可在客户端、服务端、测试中共享调用。
 */
import type { QuestionType } from '@/lib/question-types';

/** 单题答题耗时上限:1 小时,与设计文档 §Property 6 保持一致。 */
const COST_MS_MAX = 3_600_000;

/**
 * 把单道题的答案串规范化为后续比较与持久化使用的统一形式。
 *
 * 规则:
 * - 任意题型:先去除全部空白字符(空格/Tab/换行等),再转大写。
 * - SINGLE / JUDGE:返回去空白大写后的字符串(不再做其它变形)。
 * - MULTI:按字母升序去重后拼接(如输入 "ca" 返回 "AC","BCB" 返回 "BC")。
 *
 * 该函数对非法字符不做剔除——是否合法由调用方(zod 校验或 UI 层)负责。
 *
 * @param type 题型
 * @param raw  原始答案串(可能含空白、小写、乱序字母)
 * @returns 规范化后的答案串
 */
export function normalizeAnswer(type: QuestionType, raw: string): string {
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();
  if (type !== 'MULTI') {
    return cleaned;
  }
  // MULTI:升序去重
  const seen = new Set<string>();
  for (const ch of cleaned) {
    seen.add(ch);
  }
  return Array.from(seen).sort().join('');
}

/**
 * 比较用户答案与标准答案是否一致。
 *
 * 内部先调用 `normalizeAnswer` 把双方都规范化:
 * - SINGLE / JUDGE:字符串相等即视为答对。
 * - MULTI:规范化后双方均为升序去重的字母串,字符串相等等价于集合相等;
 *   因此 "BA" 与 "AB"、"AAB" 与 "ab" 都被视为相等。
 *
 * @param type          题型
 * @param userAnswer    学员提交的原始答案
 * @param correctAnswer 题库存储的标准答案
 * @returns 是否答对
 */
export function compareAnswer(
  type: QuestionType,
  userAnswer: string,
  correctAnswer: string,
): boolean {
  return normalizeAnswer(type, userAnswer) === normalizeAnswer(type, correctAnswer);
}

/**
 * 判断当前选择数量是否满足"提交"按钮的启用条件。
 *
 * - SINGLE / JUDGE:必须恰好选中 1 项。
 * - MULTI:必须选中至少 2 项,且不超过题目总选项数。
 *
 * UI 层在单选/判断模式下应保证 `selectedCount` 不超过 1
 * (选第二项时自动取消第一项),本函数本身不做该约束。
 *
 * @param type          题型
 * @param selectedCount 用户当前已选中的选项数
 * @param optionsCount  题目的总选项数(MULTI 校验用)
 * @returns 提交按钮是否应可用
 */
export function isSubmittable(
  type: QuestionType,
  selectedCount: number,
  optionsCount: number,
): boolean {
  if (type === 'MULTI') {
    return selectedCount >= 2 && selectedCount <= optionsCount;
  }
  // SINGLE / JUDGE
  return selectedCount === 1;
}

/**
 * 把答题耗时钳制到合法区间 `[0, 3_600_000]` 毫秒。
 *
 * - `NaN`:返回 0
 * - 负数:返回 0
 * - 超出上限:返回 `3_600_000`
 * - 其余有限数:截断为整数后返回
 *
 * 用于 `submitAnswer` 写入 `ExamRecord.costMs` 之前的归一化,
 * 对应设计文档 §Property 6 的字段不变量。
 *
 * @param value 客户端上报的耗时(可能为非法值)
 * @returns 钳制后的整数耗时
 */
export function clampCostMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= COST_MS_MAX) {
    return COST_MS_MAX;
  }
  return Math.trunc(value);
}
