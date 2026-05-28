import * as XLSX from 'xlsx';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { excelSource, generateExcelTemplate } from '@/lib/import/excel-source';
import { previewImport } from '@/lib/import';
import { jsonSource } from '@/lib/import/json-source';

const NUM_RUNS = 50;

const validSingleRow = {
  type: 'SINGLE',
  content: 'safe following distance',
  optionA: '10m',
  optionB: '30m',
  answer: 'B',
  categories: ['safety', 'distance'],
  explanation: 'Keep enough distance.',
  tags: ['single', 'safe'],
};

describe('importer parsing and preview', () => {
  it('parses both supported JSON shapes', () => {
    expect(jsonSource.parse(JSON.stringify([validSingleRow]))).toHaveLength(1);
    expect(jsonSource.parse({ questions: [validSingleRow] })).toHaveLength(1);
  });

  it('splits pipe-delimited categories and tags from JSON rows', () => {
    const [row] = jsonSource.parse([
      { ...validSingleRow, categories: 'signs|safety', tags: 'easy|mock' },
    ]);

    expect(row).toMatchObject({
      categories: ['signs', 'safety'],
      tags: ['easy', 'mock'],
    });
  });

  it('previewImport returns valid and invalid rows without dropping either side', () => {
    const result = previewImport(jsonSource, [
      validSingleRow,
      { ...validSingleRow, answer: 'C', optionC: '' },
    ]);

    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.row).toBe(2);
    expect(result.invalid[0]?.errors).toContain('OPTION_MISSING_FOR_ANSWER');
  });

  it('previewImport accepts JUDGE rows without option columns', () => {
    const result = previewImport(jsonSource, [
      {
        type: 'JUDGE',
        content: 'red light means stop',
        answer: 'T',
        categories: 'signals',
        tags: 'judge',
      },
    ]);

    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(0);
  });

  it('parses Excel workbooks and uses pipe as the multi-value delimiter', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      {
        type: 'MULTI',
        content: 'choose safe actions',
        optionA: 'slow down',
        optionB: 'watch mirrors',
        optionC: 'speed up',
        answer: 'AB',
        categories: 'safety|signals',
        tags: 'multi|practice',
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Questions');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    const [row] = excelSource.parse(buffer);

    expect(row).toMatchObject({
      type: 'MULTI',
      categories: ['safety', 'signals'],
      tags: ['multi', 'practice'],
      answer: 'AB',
    });
  });

  it('generated Excel template exposes the required columns', () => {
    const workbook = XLSX.read(generateExcelTemplate(), { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0] as string];
    const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet!, { header: 1 });

    expect(rows[0]).toEqual([
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
    ]);
  });

  it('preserves pipe-delimited list round trips for non-empty segments', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 12 })
            .filter((s) => s.trim().length > 0 && !s.includes('|')),
          { minLength: 0, maxLength: 6 },
        ),
        (items) => {
          const uniqueTrimmed = Array.from(new Set(items.map((item) => item.trim())));
          const [row] = jsonSource.parse([
            { ...validSingleRow, categories: uniqueTrimmed.join('|') },
          ]);

          expect(row?.categories).toEqual(uniqueTrimmed);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
