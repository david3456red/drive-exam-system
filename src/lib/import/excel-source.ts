import * as XLSX from 'xlsx';

import type { ImportRow, ImportSource } from './types';
import { normalizeRow } from './json-source';

const TEMPLATE_HEADERS = [
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
] as const;

export const excelSource: ImportSource = {
  parse(input: unknown): ImportRow[] {
    const workbook = readWorkbook(input);
    if (!workbook) return [];
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const firstSheet = workbook.Sheets[firstSheetName];
    if (!firstSheet) return [];

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: '',
    });
    return rows.map(normalizeRow);
  },
};

export function generateExcelTemplate(): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS]]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Questions');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function readWorkbook(input: unknown): XLSX.WorkBook | null {
  try {
    if (Buffer.isBuffer(input)) {
      return XLSX.read(input, { type: 'buffer' });
    }
    if (Array.isArray(input) && input.every((item) => Number.isInteger(item))) {
      return XLSX.read(Uint8Array.from(input), { type: 'array' });
    }
    if (input instanceof ArrayBuffer) {
      return XLSX.read(input, { type: 'array' });
    }
    if (ArrayBuffer.isView(input)) {
      const view = input as ArrayBufferView;
      return XLSX.read(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength), {
        type: 'array',
      });
    }
    return null;
  } catch {
    return null;
  }
}
