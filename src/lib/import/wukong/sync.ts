import type { PrismaClient } from '@prisma/client';

import { commitImportRows } from '@/lib/import';
import { prepareImportRowsWithImages } from '@/lib/import/images';
import type { ImportRow, ImportSource } from '@/lib/import/types';
import {
  DEFAULT_WUKONG_BANKS,
  WUKONG_SOURCE_SITE,
  downloadWukongImage,
  fetchWukongQuestions,
  loginWukong,
  mapWukongQuestionToImportRow,
  scanWukongCatalog,
  type WukongCatalogItem,
  type WukongCredentials,
  type WukongBankSeed,
  type WukongQuestion,
} from '@/lib/import/wukong';

export type WukongSyncProgress = {
  bankName: string;
  chapterTitle: string;
  chapterIndex: number;
  chapterCount: number;
  questionCount: number;
};

export type WukongSyncResult =
  | {
      ok: true;
      bankCount: number;
      chapterCount: number;
      questionCount: number;
      imageCount: number;
      explanationCount: number;
      insertedCount: number;
      updatedCount: number;
      skippedCount: number;
      imageFailedCount: number;
      errors: string[];
    }
  | { ok: false; error: string };

export type SyncWukongOptions = {
  prisma: PrismaClient;
  credentials: WukongCredentials;
  banks?: WukongBankSeed[];
  selections?: WukongCatalogItem[];
  fetchImpl?: typeof fetch;
  downloadImages?: boolean;
  onProgress?: (progress: WukongSyncProgress) => void | Promise<void>;
};

const rowsSource: ImportSource = {
  parse(input: unknown): ImportRow[] {
    return Array.isArray(input) ? (input as ImportRow[]) : [];
  },
};

export async function syncWukongCatalog({
  prisma,
  credentials,
  banks = [...DEFAULT_WUKONG_BANKS],
  selections,
  fetchImpl = fetch,
  downloadImages = true,
  onProgress,
}: SyncWukongOptions): Promise<WukongSyncResult> {
  if (selections && selections.length === 0) {
    return { ok: false, error: '请选择要同步的章节' };
  }

  try {
    const session = await loginWukong(credentials, fetchImpl);
    const syncItems =
      selections ?? (await scanWukongCatalog(session, banks, fetchImpl));
    if (syncItems.length === 0) {
      return { ok: false, error: '未扫描到可同步的章节' };
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let imageFailedCount = 0;
    let imageCount = 0;
    let explanationCount = 0;
    let questionCount = 0;
    const errors: string[] = [];
    const bankCodes = new Set<string>();
    const cleanedBankIds = new Set<string>();

    for (const [index, item] of syncItems.entries()) {
      bankCodes.add(item.bankCode);
      await onProgress?.({
        bankName: item.bankName,
        chapterTitle: item.title,
        chapterIndex: index + 1,
        chapterCount: syncItems.length,
        questionCount: item.questionCount,
      });

      const bank = await upsertWukongBank(prisma, item);
      const questions = await fetchWukongQuestions(session, item, fetchImpl);
      questionCount += questions.length;
      const rows = mergeRowsBySource(
        questions.map((question) => mapWukongQuestion(question, item)),
      );
      const rowsForImagePreparation = await skipImagesAlreadyStored(prisma, bank.id, rows);

      const imageNames = downloadImages ? imageNamesForRows(rowsForImagePreparation) : [];
      const failedImages = new Set<string>();
      const images = await mapWithConcurrency(imageNames, 4, async (imageName) => {
        try {
          return await downloadWukongImage(imageName, session, fetchImpl);
        } catch {
          imageFailedCount++;
          failedImages.add(imageName);
          errors.push(`图片下载失败：${item.bankName}/${item.title}/${imageName}`);
          return null;
        }
      }).then((items) => items.filter((image): image is NonNullable<typeof image> => Boolean(image)));

      const rowsWithImageFallback = rowsForImagePreparation.map((row) => {
        if (!downloadImages) return { ...row, imageUrl: undefined };
        const name = imageAttachmentReference(row.imageUrl);
        return name && failedImages.has(name) ? { ...row, imageUrl: undefined } : row;
      });

      const prepared = await prepareImportRowsWithImages(
        rowsSource,
        rowsWithImageFallback,
        images,
        { maxTotalBytes: Number.MAX_SAFE_INTEGER },
      );
      const result = await commitImportRows(prisma, prepared.rows, {
        bankId: bank.id,
        skippedCount: prepared.skippedCount,
        duplicateStrategy: 'update',
        preserveExistingImageOnUpdate: true,
        categoryStrategy: 'merge',
      });

      if (result.ok) {
        insertedCount += result.insertedCount;
        updatedCount += result.updatedCount;
        skippedCount += result.skippedCount;
        imageCount += prepared.rows.filter((row) => Boolean(row.imageUrl)).length;
        explanationCount += prepared.rows.filter((row) => Boolean(row.explanation)).length;
        if (!cleanedBankIds.has(bank.id)) {
          await cleanupWukongSeedSampleQuestions(prisma, bank.id);
          cleanedBankIds.add(bank.id);
        }
      } else {
        errors.push(`${item.bankName}/${item.title}：${result.error}`);
      }
    }

    return {
      ok: true,
      bankCount: bankCodes.size,
      chapterCount: syncItems.length,
      questionCount,
      imageCount,
      explanationCount,
      insertedCount,
      updatedCount,
      skippedCount,
      imageFailedCount,
      errors,
    };
  } catch {
    return { ok: false, error: '悟空数据同步失败，请检查账号、网络或稍后重试' };
  }
}

async function cleanupWukongSeedSampleQuestions(
  prisma: PrismaClient,
  bankId: string,
): Promise<void> {
  await prisma.question.deleteMany({
    where: {
      bankId,
      sourceSite: null,
      records: { none: {} },
      wrongs: { none: {} },
      OR: [
        { content: { contains: '示例单选题' } },
        { content: { contains: '示例多选题' } },
        { content: { contains: '示例判断题' } },
      ],
    },
  });
}

async function skipImagesAlreadyStored(
  prisma: PrismaClient,
  bankId: string,
  rows: ImportRow[],
): Promise<ImportRow[]> {
  const sourceIds = rows
    .map((row) => row.sourceQuestionId)
    .filter((id): id is string => Boolean(id));
  if (sourceIds.length === 0) return rows;

  const existing = await prisma.question.findMany({
    where: {
      bankId,
      sourceSite: WUKONG_SOURCE_SITE,
      sourceQuestionId: { in: sourceIds },
      imageUrl: { not: null },
    },
    select: { sourceQuestionId: true },
  });
  const existingWithImage = new Set(
    existing
      .map((question) => question.sourceQuestionId)
      .filter((id): id is string => Boolean(id)),
  );

  return rows.map((row) =>
    row.sourceQuestionId && existingWithImage.has(row.sourceQuestionId)
      ? { ...row, imageUrl: undefined }
      : row,
  );
}

export async function upsertWukongBank(
  prisma: PrismaClient,
  item: WukongCatalogItem,
): Promise<{ id: string }> {
  const mock = mockDefaults(item.subjectCode);
  const data = {
    name: item.bankName,
    isBuiltin: false,
    vehicleCode: item.vehicleCode,
    subjectCode: item.subjectCode,
    displayOrder: item.displayOrder ?? 0,
    mockQuestionCount: mock.count,
    mockDurationMs: mock.durationMs,
    mockPassScore: mock.passScore,
    sourceSite: WUKONG_SOURCE_SITE,
    sourceKey: `${item.vehicleCode}:${item.subjectCode}`,
  };

  return prisma.questionBank.upsert({
    where: { code: item.bankCode },
    update: data,
    create: {
      code: item.bankCode,
      ...data,
    },
    select: { id: true },
  });
}

function mapWukongQuestion(question: WukongQuestion, item: WukongCatalogItem): ImportRow {
  return mapWukongQuestionToImportRow(question, {
    bankCode: item.bankCode,
    categories: [item.title],
    sourceKey: item.sourceKey,
  });
}

function mergeRowsBySource(rows: ImportRow[]): ImportRow[] {
  const bySource = new Map<string, ImportRow>();
  const out: ImportRow[] = [];

  for (const row of rows) {
    const key =
      row.bankCode && row.sourceSite && row.sourceQuestionId
        ? `${row.bankCode}:${row.sourceSite}:${row.sourceQuestionId}`
        : null;
    if (!key) {
      out.push(row);
      continue;
    }

    const existing = bySource.get(key);
    if (!existing) {
      bySource.set(key, row);
      out.push(row);
      continue;
    }

    existing.categories = unique([...existing.categories, ...row.categories]);
    existing.tags = unique([...existing.tags, ...row.tags]);
  }

  return out;
}

function imageNamesForRows(rows: ImportRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    const value = imageAttachmentReference(row.imageUrl);
    if (value) names.add(value);
  }
  return Array.from(names);
}

function imageAttachmentReference(imageUrl: string | undefined): string | null {
  const value = imageUrl?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return null;
  if (value.startsWith('/')) return null;
  return value;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex++;
      out[index] = await mapper(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, () => worker()),
  );
  return out;
}

function mockDefaults(subjectCode: string): { count: number; durationMs: number; passScore: number } {
  if (subjectCode === 'K4') return { count: 50, durationMs: 30 * 60 * 1000, passScore: 90 };
  if (subjectCode === 'TS') return { count: 100, durationMs: 30 * 60 * 1000, passScore: 90 };
  if (subjectCode === 'SL') return { count: 100, durationMs: 30 * 60 * 1000, passScore: 90 };
  return { count: 100, durationMs: 45 * 60 * 1000, passScore: 90 };
}
