/**
 * 批量导入(Importer)子系统 —— 共享契约。
 *
 * 本模块只定义类型,不含运行时逻辑;JSON / Excel 两条来源(`json-source.ts`、
 * `excel-source.ts`)与上层流水线(`previewImport` / `commitImport`)共同
 * 引用本文件,以避免类型重复或漂移。
 *
 * 设计依据:
 * - Requirement 13.4 —— 一行非法不影响其它行,`PreviewResult` 必须能同时返回
 *   合法与非法两个集合;
 * - Requirement 14.3 —— 行级错误码以机器可读字符串表达
 *   (`OPTION_MISSING_FOR_ANSWER` 等),供 UI 做 i18n 映射。
 * - design.md 「Import Pipeline」节。
 *
 * **契约说明**(避免与 `question-validate.ts` 概念混淆):
 * - 本文件的 `ImportRow` 是"导入流水线对外可见的行级载荷",采用
 *   `optionA..optionF` 六列形态,贴近 Excel 的列模型,也是 JSON 形态对齐后的
 *   规范化形式。
 * - `question-validate.ts` 内部使用同名 `ImportRow` 作为 zod schema 的推断
 *   结果(允许 `null` 字段),仅作为校验过渡形态;经 `validateRow` 转换后,
 *   外部 API 始终返回本文件定义的 `ImportRow`(用 `undefined` 表示缺省)。
 *
 * @module lib/import/types
 */

// ============================================================
// ImportRow —— 导入流水线对外的行级载荷
// ============================================================

/**
 * 单条导入行的标准化形态。
 *
 * 字段语义:
 * - `type`:题型字符串(`SINGLE` / `MULTI` / `JUDGE`)。这里类型为 `string`
 *   而非具体联合,因为 `parse` 阶段尚未完成枚举校验,合法性由
 *   `validateRow` 二次确认。
 * - `content`:题干文本,必填非空(由 `validateRow` 强制)。
 * - `imageUrl?`:可选题图 URL。
 * - `optionA..optionF?`:六个可选选项列。`undefined` 表示该列在源数据中
 *   为空 / 缺失;`validateRow` 在做"answer 引用必有选项"联动检查时会把
 *   `undefined` / 空白文本视作缺失。
 * - `answer`:答案字符串(SINGLE 形如 `'B'`,MULTI 形如 `'AC'`,JUDGE 为
 *   `'T'` / `'F'`)。具体格式由 `validateRow` 校验。
 * - `categories`:分类名数组,**已由来源层按 `|`(U+007C)分隔** 拆好
 *   (Requirement 14.2);允许空数组。
 * - `explanation?`:可选解析文本。
 * - `tags`:标签数组,**已由来源层按 `|` 分隔** 拆好;允许空数组。
 * - `bankCode?`:可选题库编码。来源层若已知应填入(便于多题库混合导入);
 *   未填时由调用方按"当前题库上下文"统一兜底。
 *
 * 该形态既可作为"未校验输入"也可作为"已校验输出";区分由所在管线阶段
 * 决定(`PreviewResult.valid` 为已校验,`ImportSource.parse` 返回值
 * 为待校验)。
 */
export interface ImportRow {
  type: string;
  content: string;
  imageUrl?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  optionE?: string;
  optionF?: string;
  answer: string;
  categories: string[];
  explanation?: string;
  tags: string[];
  bankCode?: string;
}

// ============================================================
// InvalidRow / PreviewResult / CommitResult
// ============================================================

/**
 * 单条非法行的描述。`row` 为人类可读的 1-indexed 行号(Excel 视角的"第 N 行",
 * JSON 视角的"第 N 条"),`errors` 为机器可读的错误码列表(详见
 * `question-validate.ts` 中 `ERR_*` 常量,以及 `validateRow` 自身可能
 * 附加的额外错误码)。
 */
export interface InvalidRow {
  row: number;
  errors: string[];
}

/**
 * 预览阶段的结果。`previewImport` 不写库,仅返回拆分后的合法 / 非法集合,
 * 由 UI 渲染"将导入 N 条"与"跳过 M 条非法记录"两组数字
 * (Requirement 13.5)。
 */
export interface PreviewResult {
  valid: ImportRow[];
  invalid: InvalidRow[];
}

/**
 * 提交阶段的结果。
 *
 * - 成功:`insertedCount` 为本次实际写入题目的行数,`skippedCount` 为
 *   被跳过的非法行数(与 `PreviewResult.invalid.length` 对齐)。
 * - 失败:`error` 为不可恢复错误的简短文案(如鉴权失败、事务异常等);
 *   行级错误一律走 `skippedCount` 通道,不会进入 `error`。
 */
export type CommitResult =
  | { ok: true; insertedCount: number; skippedCount: number }
  | { ok: false; error: string };

// ============================================================
// ImportSource —— 来源解析的统一抽象
// ============================================================

/**
 * 导入来源的统一抽象。JSON 与 Excel 两个具体实现(`json-source.ts` /
 * `excel-source.ts`)各自处理输入差异,把外部数据规范化为 `ImportRow[]`,
 * 上层流水线(`previewImport` / `commitImport`)对来源类型无感。
 *
 * **契约**:
 * - `parse(input)` 应做"尽力而为"的形态对齐,把每条记录映射为
 *   `ImportRow` 形态(包括按 `|` 拆分多值列)。
 * - 即便某行字段缺失或类型错位,`parse` 也应返回该行(以待 `validateRow`
 *   收集详细错误码),而非抛出异常或丢弃。
 * - TypeScript 类型 `ImportRow[]` 是"形态承诺"而非"合法性承诺";
 *   元素仍可能存在 `validateRow` 后被判定为非法。
 * - `parse` 不读写数据库,不发起网络请求;Excel/JSON 解析允许在内存中完成。
 */
export interface ImportSource {
  parse(input: unknown): ImportRow[];
}
