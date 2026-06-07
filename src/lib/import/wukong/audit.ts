import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ImportRow } from '@/lib/import/types';
import { JUDGE_OPTIONS, type QuestionOption } from '@/lib/question-validate';

export type AuditQuestionSnapshot = {
  id?: string;
  key: string;
  bankCode: string;
  sourceQuestionId: string;
  type: string;
  content: string;
  options: string;
  answer: string;
  explanation: string | null;
  imageName: string | null;
  imageUrl?: string | null;
  hasRecords?: boolean;
  hasWrongs?: boolean;
};

export type ExpectedSnapshotResult = {
  snapshots: AuditQuestionSnapshot[];
  duplicateCount: number;
};

export type AuditDiff =
  | {
      kind: 'missing';
      key: string;
      bankCode: string;
      sourceQuestionId: string;
    }
  | {
      kind: 'extra';
      key: string;
      bankCode: string;
      sourceQuestionId: string;
    }
  | {
      kind: 'field';
      key: string;
      bankCode: string;
      sourceQuestionId: string;
      fields: string[];
    }
  | {
      kind: 'imageRef';
      key: string;
      bankCode: string;
      sourceQuestionId: string;
      expected: string | null;
      actual: string | null;
    }
  | {
      kind: 'imageMissing';
      key: string;
      bankCode: string;
      sourceQuestionId: string;
      imageUrl: string | null | undefined;
    }
  | {
      kind: 'imageHash';
      key: string;
      bankCode: string;
      sourceQuestionId: string;
      expectedHash: string;
      actualHash: string;
    };

export type SafePruneSelection = {
  safeDeleteIds: string[];
  retained: AuditQuestionSnapshot[];
};

const COMPARED_FIELDS = ['type', 'content', 'options', 'answer', 'explanation'] as const;

export function buildExpectedSnapshots(rows: ImportRow[]): ExpectedSnapshotResult {
  const byKey = new Map<string, AuditQuestionSnapshot>();
  let duplicateCount = 0;

  for (const row of rows) {
    const snapshot = snapshotFromImportRow(row);
    if (byKey.has(snapshot.key)) duplicateCount++;
    byKey.set(snapshot.key, snapshot);
  }

  return {
    snapshots: Array.from(byKey.values()),
    duplicateCount,
  };
}

export function snapshotFromImportRow(row: ImportRow): AuditQuestionSnapshot {
  if (!row.bankCode || !row.sourceQuestionId) {
    throw new Error('Wukong audit rows require bankCode and sourceQuestionId');
  }

  return {
    key: questionKey(row.bankCode, row.sourceQuestionId),
    bankCode: row.bankCode,
    sourceQuestionId: row.sourceQuestionId,
    type: row.type,
    content: row.content,
    options: JSON.stringify(optionsForRow(row)),
    answer: row.answer,
    explanation: row.explanation ?? null,
    imageName: row.imageUrl?.trim() || null,
  };
}

export function questionKey(bankCode: string, sourceQuestionId: string): string {
  return `${bankCode}:${sourceQuestionId}`;
}

export function diffAuditSnapshots(
  expected: readonly AuditQuestionSnapshot[],
  local: readonly AuditQuestionSnapshot[],
): AuditDiff[] {
  const diffs: AuditDiff[] = [];
  const expectedByKey = new Map(expected.map((item) => [item.key, item]));
  const localByKey = new Map(local.map((item) => [item.key, item]));

  for (const item of expected) {
    const actual = localByKey.get(item.key);
    if (!actual) {
      diffs.push({
        kind: 'missing',
        key: item.key,
        bankCode: item.bankCode,
        sourceQuestionId: item.sourceQuestionId,
      });
      continue;
    }

    const fields = COMPARED_FIELDS.filter((field) => item[field] !== actual[field]);
    if (fields.length > 0) {
      diffs.push({
        kind: 'field',
        key: item.key,
        bankCode: item.bankCode,
        sourceQuestionId: item.sourceQuestionId,
        fields: [...fields],
      });
    }

    if (item.imageName !== actual.imageName) {
      diffs.push({
        kind: 'imageRef',
        key: item.key,
        bankCode: item.bankCode,
        sourceQuestionId: item.sourceQuestionId,
        expected: item.imageName,
        actual: actual.imageName,
      });
    }
  }

  for (const item of local) {
    if (!expectedByKey.has(item.key)) {
      diffs.push({
        kind: 'extra',
        key: item.key,
        bankCode: item.bankCode,
        sourceQuestionId: item.sourceQuestionId,
      });
    }
  }

  return diffs;
}

export function selectSafePruneQuestions(localExtras: readonly AuditQuestionSnapshot[]): SafePruneSelection {
  const safeDeleteIds: string[] = [];
  const retained: AuditQuestionSnapshot[] = [];

  for (const item of localExtras) {
    if (item.id && !item.hasRecords && !item.hasWrongs) {
      safeDeleteIds.push(item.id);
    } else {
      retained.push(item);
    }
  }

  return { safeDeleteIds, retained };
}

export function resolveLocalImagePaths(imageUrl: string | null | undefined, cwd = process.cwd()): string[] {
  const relative = normalizedUploadRelativePath(imageUrl);
  if (!relative) return [];

  return [
    safeResolve(path.join(cwd, 'public'), relative),
    safeResolve(path.join(cwd, 'data'), relative),
  ].filter((candidate): candidate is string => typeof candidate === 'string' && existsSync(candidate));
}

export function hashFile(filePath: string): string {
  return sha256(readFileSync(filePath));
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function optionsForRow(row: ImportRow): QuestionOption[] {
  if (row.type === 'JUDGE') {
    return JUDGE_OPTIONS.map((option) => ({ ...option }));
  }

  const out: QuestionOption[] = [];
  for (const key of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    const text = row[`option${key}`];
    if (text) out.push({ key, text });
  }
  return out;
}

function normalizedUploadRelativePath(imageUrl: string | null | undefined): string | null {
  const value = imageUrl?.trim().replace(/\\/g, '/');
  if (!value || !value.startsWith('/uploads/questions/')) return null;
  return value.replace(/^\/+/, '');
}

function safeResolve(root: string, relative: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  const rootWithSeparator = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  return resolved.startsWith(rootWithSeparator) ? resolved : null;
}
