import type { Prisma, PrismaClient } from '@prisma/client';

import { JUDGE_OPTIONS, type QuestionOption } from '@/lib/question-validate';

import type { CommitResult, ImportRow, ImportSource, PreviewResult } from './types';
import { validateRow } from './validate';

type CommitOptions = {
  bankId?: string;
  duplicateStrategy?: 'skip' | 'update';
  preserveExistingImageOnUpdate?: boolean;
  categoryStrategy?: 'replace' | 'merge';
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
  let updatedCount = 0;
  let skippedCount = options.skippedCount ?? 0;

  if (rows.length === 0) {
    return { ok: true, insertedCount, updatedCount, skippedCount };
  }

  await prisma.$transaction(async (tx) => {
    const bankCache = new Map<string, string | null>();

    for (const row of rows) {
 const bankId = await resolveBankId(tx, row, options, bankCache);
 if (!bankId) {
 skippedCount++;
 continue;
 }
 const existing = await findImportedSourceQuestion(tx, bankId, row);
 if (existing) {
 if (options.duplicateStrategy !== 'update') {
 skippedCount++;
 continue;
 }

 const categoryIds = await resolveCategoryIds(tx, row.categories);
 await tx.question.update({
 where: { id: existing.id },
 data: questionDataForRow(row, {
 currentImageUrl: existing.imageUrl,
 preserveExistingImageOnUpdate: options.preserveExistingImageOnUpdate,
 }),
 });
 await syncQuestionCategories(tx, existing.id, categoryIds, options.categoryStrategy ?? 'replace');
 updatedCount++;
 continue;
 }

 const question = await tx.question.create({
 data: {
 bankId,
 ...questionDataForRow(row),
 },
 select: { id: true },
 });

      const categoryIds = await resolveCategoryIds(tx, row.categories);
      await syncQuestionCategories(tx, question.id, categoryIds, 'replace');

      insertedCount++;
    }
  });

  return { ok: true, insertedCount, updatedCount, skippedCount };
}

async function findImportedSourceQuestion(
 tx: Prisma.TransactionClient,
 bankId: string,
 row: ImportRow,
): Promise<{ id: string; imageUrl: string | null } | null> {
 if (!row.sourceSite || !row.sourceQuestionId) return null;
 return tx.question.findFirst({
 where: {
 bankId,
 sourceSite: row.sourceSite,
 sourceQuestionId: row.sourceQuestionId,
 },
 select: { id: true, imageUrl: true },
 });
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

async function syncQuestionCategories(
 tx: Prisma.TransactionClient,
 questionId: string,
 categoryIds: string[],
 strategy: 'replace' | 'merge',
): Promise<void> {
 if (strategy === 'replace') {
 await tx.questionCategory.deleteMany({ where: { questionId } });
 if (categoryIds.length > 0) {
 await tx.questionCategory.createMany({
 data: categoryIds.map((categoryId) => ({
 questionId,
 categoryId,
 })),
 });
 }
 return;
 }

 if (categoryIds.length === 0) return;
 const existing = await tx.questionCategory.findMany({
 where: { questionId },
 select: { categoryId: true },
 });
 const existingIds = new Set(existing.map((item) => item.categoryId));
 const missing = categoryIds.filter((categoryId) => !existingIds.has(categoryId));
 if (missing.length > 0) {
 await tx.questionCategory.createMany({
 data: missing.map((categoryId) => ({
 questionId,
 categoryId,
 })),
 });
 }
}

function questionDataForRow(
 row: ImportRow,
 options: {
 currentImageUrl?: string | null;
 preserveExistingImageOnUpdate?: boolean;
 } = {},
): Omit<Prisma.QuestionUncheckedCreateInput, 'id' | 'bankId' | 'createdAt'> {
 const shouldPreserveImage =
 options.preserveExistingImageOnUpdate && options.currentImageUrl != null;
 return {
 type: row.type,
 content: row.content,
 imageUrl: shouldPreserveImage ? options.currentImageUrl : row.imageUrl ?? null,
 options: JSON.stringify(optionsForRow(row)),
 answer: row.answer,
 explanation: row.explanation ?? null,
 tags: JSON.stringify(row.tags),
 sourceSite: row.sourceSite ?? null,
 sourceQuestionId: row.sourceQuestionId ?? null,
 sourceMeta: row.sourceMeta ?? null,
 };
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
