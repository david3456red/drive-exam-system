/**
 * Parse a JSON or Excel payload into a list of questions ready to validate.
 *
 * Both paths produce the same `RawImportItem` shape. We intentionally do NOT
 * Zod-validate here -- callers run `QuestionImportSchema.safeParse()` on each
 * row so they can collect line-numbered errors.
 */
import * as XLSX from 'xlsx';

export type RawImportItem = {
  type: string;
  content: string;
  imageUrl: string | null;
  options: { key: string; text: string }[];
  answer: string;
  explanation: string | null;
  categories: string[];
  tags: string[];
};

export type RawImportResult =
  | { ok: true; items: RawImportItem[] }
  | { ok: false; error: string };

/**
 * Parse a JSON string. Accepts either:
 *   - a top-level array `[ {...}, {...} ]`
 *   - an object with a `questions` array `{ "questions": [...] }`
 */
export function parseJsonImport(raw: string): RawImportResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, error: 'JSON 内容为空' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败: ' + (e as Error).message };
  }

  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { questions?: unknown }).questions)
      ? (parsed as { questions: unknown[] }).questions
      : [];

  if (list.length === 0) {
    return { ok: false, error: '未在 JSON 中找到题目数组(应为 [...] 或 { "questions": [...] })' };
  }

  const items: RawImportItem[] = list.map((entry) => normalizeJsonEntry(entry));
  return { ok: true, items };
}

function normalizeJsonEntry(entry: unknown): RawImportItem {
  const o = (entry ?? {}) as Record<string, unknown>;
  const options: RawImportItem['options'] = Array.isArray(o.options)
    ? (o.options as unknown[]).map((opt) => {
        const op = (opt ?? {}) as Record<string, unknown>;
        return {
          key: String(op.key ?? '').trim().toUpperCase(),
          text: String(op.text ?? ''),
        };
      })
    : [];
  const categories: string[] = Array.isArray(o.categories)
    ? (o.categories as unknown[]).map((c) => String(c).trim()).filter(Boolean)
    : [];
  const tags: string[] = Array.isArray(o.tags)
    ? (o.tags as unknown[]).map((t) => String(t).trim()).filter(Boolean)
    : [];
  return {
    type: String(o.type ?? '').trim().toUpperCase(),
    content: String(o.content ?? '').trim(),
    imageUrl: o.imageUrl ? String(o.imageUrl).trim() || null : null,
    options,
    answer: String(o.answer ?? '').trim().toUpperCase(),
    explanation: o.explanation ? String(o.explanation) : null,
    categories,
    tags,
  };
}

/**
 * Parse an Excel buffer. Expected columns (case-insensitive, see template):
 *   type, content, imageUrl, optionA..optionF, answer, categories, explanation, tags
 *
 * `categories` and `tags` are pipe (|) separated.
 */
export function parseExcelImport(buffer: ArrayBuffer | Buffer | Uint8Array): RawImportResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (e) {
    return { ok: false, error: 'Excel 解析失败: ' + (e as Error).message };
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { ok: false, error: 'Excel 没有工作表' };
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  if (rows.length === 0) {
    return { ok: false, error: 'Excel 没有数据行(请确认第一行是表头)' };
  }

  const items: RawImportItem[] = rows.map((row) => normalizeExcelRow(row));
  return { ok: true, items };
}

function normalizeExcelRow(row: Record<string, unknown>): RawImportItem {
  // Allow case-insensitive column names by building a lowercase lookup.
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    map.set(String(k).trim().toLowerCase(), v);
  }
  const get = (key: string): string => {
    const v = map.get(key.toLowerCase());
    return v == null ? '' : String(v).trim();
  };

  const options: RawImportItem['options'] = [];
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    const text = get('option' + letter);
    if (text) options.push({ key: letter, text });
  }

  const splitPipe = (s: string): string[] =>
    s
      .split(/[|,;]/)
      .map((x) => x.trim())
      .filter(Boolean);

  return {
    type: get('type').toUpperCase(),
    content: get('content'),
    imageUrl: get('imageurl') || null,
    options,
    answer: get('answer').toUpperCase(),
    explanation: get('explanation') || null,
    categories: splitPipe(get('categories')),
    tags: splitPipe(get('tags')),
  };
}

/** Generate an Excel template as ArrayBuffer for streaming as a download. */
export function buildExcelTemplate(): ArrayBuffer {
  const headers = [
    'type',
    'content',
    'imageUrl',
    'optionA',
    'optionB',
    'optionC',
    'optionD',
    'optionE',
    'optionF',
    'answer',
    'categories',
    'explanation',
    'tags',
  ];
  const sample: (string | number)[][] = [
    headers,
    [
      'SINGLE',
      '黄灯亮时表示什么?',
      '',
      '禁止通行',
      '警示,谨慎通行',
      '可以通行',
      '停车检查',
      '',
      '',
      'B',
      '交通信号|基础',
      '黄灯亮起是警示信号,提示驾驶员注意减速通过。',
      '信号灯,基础',
    ],
    [
      'MULTI',
      '以下哪些行为属于违法?',
      '',
      '酒驾',
      '闯红灯',
      '系安全带',
      '超速',
      '',
      '',
      'ABD',
      '违法行为',
      '',
      '',
    ],
    [
      'JUDGE',
      '红灯亮时车辆必须停车等待。',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'T',
      '交通信号',
      '',
      '',
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(sample);
  // Column widths (heuristic)
  ws['!cols'] = [
    { wch: 8 },
    { wch: 40 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 8 },
    { wch: 18 },
    { wch: 30 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'questions');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
