import type { ImportRow, ImportSource } from './types';

export const jsonSource: ImportSource = {
  parse(input: unknown): ImportRow[] {
    const value = typeof input === 'string' ? parseJson(input) : input;
    const rows = Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.questions)
        ? value.questions
        : [];

    return rows.map(normalizeRow);
  },
};

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return [];
  }
}

export function normalizeRow(value: unknown): ImportRow {
  const row = isRecord(value) ? value : {};
  return {
    type: requiredText(row.type).toUpperCase(),
    content: requiredText(row.content),
    imageUrl: optionalText(row.imageUrl),
    optionA: optionalText(row.optionA),
    optionB: optionalText(row.optionB),
    optionC: optionalText(row.optionC),
    optionD: optionalText(row.optionD),
    optionE: optionalText(row.optionE),
    optionF: optionalText(row.optionF),
    answer: requiredText(row.answer).toUpperCase(),
    categories: splitList(row.categories),
    explanation: optionalText(row.explanation),
    tags: splitList(row.tags),
    bankCode: optionalText(row.bankCode),
  };
}

export function splitList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split('|') : [];
  const trimmed = raw
    .map((item) => requiredText(item))
    .filter((item) => item.length > 0);
  return Array.from(new Set(trimmed));
}

function requiredText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function optionalText(value: unknown): string | undefined {
  const text = requiredText(value);
  return text.length > 0 ? text : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
