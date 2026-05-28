/**
 * 会话快照序列化模块(Snapshot_Serializer)。
 *
 * 纯函数,零依赖。负责把 `ExamAttempt.questionOrder` 与 `ExamAttempt.categoryIds`
 * 在 SQLite 列(TEXT)与运行时 `string[]` 之间进行 JSON 编解码。
 *
 * 设计要点(Requirement 17.4 / 17.5):
 * - 持久化形态:JSON 字符串数组,例如 `'["q1","q2","q3"]'`、`'[]'`。
 * - 往返性:对任意合法字符串数组 `xs`,`parseOrder(serializeOrder(xs))` 与
 *   `parseCategoryIds(serializeCategoryIds(xs))` 必须严格等于 `xs`(顺序与元素均保留)。
 * - safe-fail:对非 JSON、非数组、含非字符串元素的输入,以及 `null` / `undefined`,
 *   `parseOrder` / `parseCategoryIds` 必须返回 `[]`,不抛异常。
 *
 * 接口签名见 design.md 「`snapshot.ts` 接口」一节。
 */

/**
 * 序列化字符串数组为 JSON 字符串。约定输入为合法的 `string[]`;调用方负责保证。
 *
 * 该函数不对元素做任何额外校验或转义,仅依赖 `JSON.stringify` 的标准行为,
 * 因此对任意 `string[]`(包括空数组、含特殊字符或 unicode 的字符串)都是无损的。
 */
export function serializeOrder(ids: string[]): string {
  return JSON.stringify(ids);
}

/**
 * 反序列化题目顺序快照。对非 JSON、非数组、含非字符串元素、`null` / `undefined`
 * 一律返回 `[]`,不抛异常。
 */
export function parseOrder(json: string | null | undefined): string[] {
  return safeParseStringArray(json);
}

/**
 * 序列化分类 ID 数组为 JSON 字符串。语义与 `serializeOrder` 相同,
 * 单独导出仅为在调用点表达"这是分类 ID 快照而非题目顺序"。
 */
export function serializeCategoryIds(ids: string[]): string {
  return JSON.stringify(ids);
}

/**
 * 反序列化分类 ID 快照。safe-fail 行为与 `parseOrder` 相同。
 */
export function parseCategoryIds(json: string | null | undefined): string[] {
  return safeParseStringArray(json);
}

/**
 * 内部工具:把任意输入解析为 `string[]`,任何异常或非法形态都退化为 `[]`。
 *
 * 失败路径(全部返回 `[]`):
 * 1. 入参为 `null` / `undefined` / 非 string;
 * 2. `JSON.parse` 抛出异常(非合法 JSON);
 * 3. 解析结果不是数组(对象、数字、字符串、null、布尔等);
 * 4. 数组中存在任何非 string 元素(数字、对象、null 等)。
 */
function safeParseStringArray(json: string | null | undefined): string[] {
  if (typeof json !== 'string') {
    return [];
  }
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
