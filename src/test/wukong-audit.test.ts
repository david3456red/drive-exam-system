import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ImportRow } from '@/lib/import/types';
import {
  buildExpectedSnapshots,
  diffAuditSnapshots,
  hashFile,
  resolveLocalImagePaths,
  selectSafePruneQuestions,
  sha256,
  type AuditQuestionSnapshot,
} from '@/lib/import/wukong/audit';

const baseRow: ImportRow = {
  bankCode: 'C1_K1',
  sourceSite: 'wukong',
  sourceQuestionId: '100',
  type: 'SINGLE',
  content: 'question',
  optionA: 'A',
  optionB: 'B',
  answer: 'A',
  categories: ['chapter'],
  tags: ['wukong'],
  imageUrl: 'remote.jpg',
  explanation: 'analysis',
};

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('wukong audit helpers', () => {
  it('deduplicates expected rows by bank and source question id', () => {
    const result = buildExpectedSnapshots([
      baseRow,
      { ...baseRow, categories: ['another chapter'] },
      { ...baseRow, sourceQuestionId: '101', content: 'next question', imageUrl: undefined },
    ]);

    expect(result.duplicateCount).toBe(1);
    expect(result.snapshots.map((item) => item.key)).toEqual(['C1_K1:100', 'C1_K1:101']);
  });

  it('reports missing, extra, field, and image reference differences', () => {
    const expected = buildExpectedSnapshots([
      baseRow,
      { ...baseRow, sourceQuestionId: '101', content: 'remote only', imageUrl: undefined },
    ]).snapshots;
    const local: AuditQuestionSnapshot[] = [
      {
        ...expected[0]!,
        content: 'changed',
        imageName: 'other.jpg',
      },
      {
        ...expected[0]!,
        key: 'C1_K1:999',
        sourceQuestionId: '999',
      },
    ];

    expect(diffAuditSnapshots(expected, local)).toEqual([
      {
        kind: 'field',
        key: 'C1_K1:100',
        bankCode: 'C1_K1',
        sourceQuestionId: '100',
        fields: ['content'],
      },
      {
        kind: 'imageRef',
        key: 'C1_K1:100',
        bankCode: 'C1_K1',
        sourceQuestionId: '100',
        expected: 'remote.jpg',
        actual: 'other.jpg',
      },
      {
        kind: 'missing',
        key: 'C1_K1:101',
        bankCode: 'C1_K1',
        sourceQuestionId: '101',
      },
      {
        kind: 'extra',
        key: 'C1_K1:999',
        bankCode: 'C1_K1',
        sourceQuestionId: '999',
      },
    ]);
  });

  it('finds local upload files and hashes bytes', () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'wukong-audit-'));
    const uploadDir = path.join(tempDir, 'public', 'uploads', 'questions');
    mkdirSync(uploadDir, { recursive: true });
    const imagePath = path.join(uploadDir, 'a.png');
    writeFileSync(imagePath, Buffer.from([1, 2, 3]));

    expect(resolveLocalImagePaths('/uploads/questions/a.png', tempDir)).toEqual([imagePath]);
    expect(hashFile(imagePath)).toBe(sha256(Buffer.from([1, 2, 3])));
    expect(resolveLocalImagePaths('/not-uploads/a.png', tempDir)).toEqual([]);
  });

  it('selects only unreferenced extra questions for safe pruning', () => {
    const selection = selectSafePruneQuestions([
      { ...buildSnapshot('q1'), id: 'q1', hasRecords: false, hasWrongs: false },
      { ...buildSnapshot('q2'), id: 'q2', hasRecords: true, hasWrongs: false },
      { ...buildSnapshot('q3'), id: 'q3', hasRecords: false, hasWrongs: true },
      { ...buildSnapshot('q4'), hasRecords: false, hasWrongs: false },
    ]);

    expect(selection.safeDeleteIds).toEqual(['q1']);
    expect(selection.retained.map((item) => item.key)).toEqual(['C1_K1:q2', 'C1_K1:q3', 'C1_K1:q4']);
  });
});

function buildSnapshot(sourceQuestionId: string): AuditQuestionSnapshot {
  return {
    key: `C1_K1:${sourceQuestionId}`,
    bankCode: 'C1_K1',
    sourceQuestionId,
    type: 'SINGLE',
    content: sourceQuestionId,
    options: '[]',
    answer: 'A',
    explanation: null,
    imageName: null,
  };
}
