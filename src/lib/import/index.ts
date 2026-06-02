import type { Prisma, PrismaClient } from '@prisma/client';

import { JUDGE_OPTIONS, type QuestionOption } from '@/lib/question-validate';

import type { CommitResult, ImportRow, ImportSource, PreviewResult } from './types';
import { validateRow } from './validate';

type CommitOptions = {
  bankId?: string;
};

type CommitRowsOptions = CommitOptions & {
  skippedCount?: number;
};

export function previewImport(source: ImportSource, payload: unknown): PreviewResult {
  const rows = source.parse(payload);
  const result: PreviewResult = { valid: [], invalid: [] };

  rows.forEach((row, index) => {
    const validated = validateRow(row, index);
    if (validated.ok) {
      result.valid.push(validated.data);
    } else {
      result.invalid.push({ row: validated.row, errors: validated.errors });
    }
  });

  return result;
}

export async function commitImport(
  prisma: PrismaClient,
  source: ImportSource,
  payload: unknown,
  options: CommitOptions = {},
): Promise<CommitResult> {
  const preview = previewImport(source, payload);

  return commitImportRows(prisma, preview.valid, {
    ...options,
    skippedCount: preview.invalid.length,
  });
}

export async function commitImportRows(
  prisma: PrismaClient,
  rows: ImportRow[],
  options: CommitRowsOptions = {},
): Promise<CommitResult> {
  let insertedCount = 0;
  let skippedCount = options.skippedCount ?? 0;

  if (rows.length === 0) {
    return { ok: true, insertedCount, skippedCount };
  }

  await prisma.$transaction(async (tx) => {
    const bankCache = new Map<string, string | null>();

    for (const row of rows) {
      const bankId = await resolveBankId(tx, row, options, bankCache);
      if (!bankId) {
        skippedCount++;
        continue;
      }

      const question = await tx.question.create({
        data: {
          bankId,
          type: row.type,
          content: row.content,
          imageUrl: row.imageUrl ?? null,
          options: JSON.stringify(optionsForRow(row)),
          answer: row.answer,
          explanation: row.explanation ?? null,
          tags: JSON.stringify(row.tags),
        },
        select: { id: true },
      });

      const categoryIds = await resolveCategoryIds(tx, row.categories);
      if (categoryIds.length > 0) {
        await tx.questionCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            questionId: question.id,
            categoryId,
          })),
        });
      }

      insertedCount++;
    }
  });

  return { ok: true, insertedCount, skippedCount };
}

async function resolveBankId(
  tx: Prisma.TransactionClient,
  row: ImportRow,
  options: CommitOptions,
  cache: Map<string, string | null>,
): Promise<string | null> {
  if (options.bankId) {
    return options.bankId;
  }
  if (row.bankCode) {
    if (!cache.has(row.bankCode)) {
      const bank = await tx.questionBank.findUnique({
        where: { code: row.bankCode },
        select: { id: true },
      });
      cache.set(row.bankCode, bank?.id ?? null);
    }
    return cache.get(row.bankCode) ?? null;
  }
  return options.bankId ?? null;
}

async function resolveCategoryIds(
  tx: Prisma.TransactionClient,
  names: string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const name of names) {
    const existing = await tx.category.findFirst({
      where: { name, parentId: null },
      select: { id: true },
    });
    if (existing) {
      out.push(existing.id);
      continue;
    }
    const created = await tx.category.create({
      data: { name, parentId: null },
      select: { id: true },
    });
    out.push(created.id);
  }
  return out;
}

function optionsForRow(row: ImportRow): QuestionOption[] {
  if (row.type === 'JUDGE') {
    return JUDGE_OPTIONS.map((option) => ({ ...option }));
  }
  const out: QuestionOption[] = [];
  for (const key of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    const text = row[`option${key}`];
    if (text) {
      out.push({ key, text });
    }
  }
  return out;
}
