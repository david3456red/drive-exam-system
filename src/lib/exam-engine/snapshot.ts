/**
 * 答题模式 (Exam Modes) - 题目顺序与分类 ID 的序列化 / 反序列化
 *
 * `ExamAttempt.questionOrder` 与 `ExamAttempt.categoryIds` 在数据库中以 JSON
 * 字符串形式存储 (`String @default("[]")`),进入应用层时需要还原成 `string[]`,
 * 写回时需要再次序列化。本模块集中提供这一对纯函数,职责限定在:
 *
 * - `serializeOrder` / `serializeCategoryIds`:把字符串数组序列化为 JSON 文本。
 * - `parseOrder` / `parseCategoryIds`:把 JSON 文本宽松地还原为 `string[]`,
 *   解析失败、不是数组、或元素不是字符串时统一返回 `[]`,绝不抛错。
 *
 * 这样做的目的是:即使 `ExamAttempt.questionOrder` 在数据库中因迁移、手工修改
 * 等原因损坏,会话加载逻辑也不会因为 `JSON.parse` 抛错而整体崩溃,而是降级为
 * 空快照,由上层根据模式自行处理(例如提示用户放弃后重开)。
 *
 * 全部为纯函数,无任何 I/O 或副作用,可在客户端与服务端共用。
 */

/**
 * 把字符串数组序列化为 JSON 文本。
 *
 * - 空数组返回 `"[]"`。
 * - 等价于 `JSON.stringify(ids)`,在此薄封装一层是为了在调用点表达意图。
 *
 * @param ids 题目 ID 列表(或任何字符串数组)。
 * @returns JSON 字符串,适合写入 `ExamAttempt.questionOrder`。
 */
export function serializeOrder(ids: string[]): string {
  return JSON.stringify(ids);
}

/**
 * 宽松地把 JSON 文本还原为字符串数组。
 *
 * 任意一种异常输入都会回退到 `[]`,而不抛出错误:
 * - JSON 解析失败(语法错误、非法转义等)
 * - 解析结果不是数组(对象、字符串、数字、布尔、null 等)
 * - 数组元素中存在任何非字符串值
 *
 * 之所以采取"全或无"的语义(只要有一个非字符串元素就视为整体损坏),
 * 是因为 `questionOrder` / `categoryIds` 的语义都依赖元素全部为合法 ID,
 * 部分还原会让上层在错误数据上做出更隐蔽的错误决策。
 *
 * @param json 来自数据库的 JSON 字符串。
 * @returns 字符串数组;输入不合法时返回空数组。
 */
export function parseOrder(json: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  for (const item of parsed) {
    if (typeof item !== 'string') {
      return [];
    }
  }

  return parsed as string[];
}

/**
 * 把章节分类 ID 数组序列化为 JSON 文本。
 *
 * 与 `serializeOrder` 行为完全一致,单独导出是为了在调用点保留语义,
 * 便于以后对两类数据采用不同存储策略时分别演进。
 *
 * @param ids `Category.id` 列表。
 * @returns JSON 字符串,适合写入 `ExamAttempt.categoryIds`。
 */
export function serializeCategoryIds(ids: string[]): string {
  return serializeOrder(ids);
}

/**
 * 宽松地把章节分类 JSON 文本还原为字符串数组,语义同 `parseOrder`。
 *
 * @param json 来自数据库的 JSON 字符串。
 * @returns 字符串数组;输入不合法时返回空数组。
 */
export function parseCategoryIds(json: string): string[] {
  return parseOrder(json);
}
