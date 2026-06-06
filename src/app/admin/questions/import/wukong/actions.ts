'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
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
} from '@/lib/import/wukong';
import { requireUser } from '@/lib/server-session';

export type WukongScanResult =
  | { ok: true; items: WukongCatalogItem[] }
  | { ok: false; error: string };

export type WukongImportResult =
  | {
      ok: true;
      bankCount: number;
      insertedCount: number;
      skippedCount: number;
      imageFailedCount: number;
      errors: string[];
    }
  | { ok: false; error: string };

export async function scanWukongCatalogAction(
  username: string,
  password: string,
): Promise<WukongScanResult> {
  requireUser('question:import');
  try {
    const session = await loginWukong({ username, password });
    const items = await scanWukongCatalog(session, [...DEFAULT_WUKONG_BANKS]);
    return { ok: true, items };
  } catch {
    return { ok: false, error: '登录或扫描失败，请检查账号密码和网络' };
  }
}

export async function importWukongCatalogAction(
  username: string,
  password: string,
  selections: WukongCatalogItem[],
): Promise<WukongImportResult> {
  requireUser('question:import');
  if (selections.length === 0) {
    return { ok: false, error: '请选择要导入的章节' };
  }

  try {
    const session = await loginWukong({ username, password });
    let insertedCount = 0;
    let skippedCount = 0;
    let imageFailedCount = 0;
    const errors: string[] = [];
    const bankCodes = new Set<string>();

    for (const item of selections) {
      const bank = await upsertWukongBank(item);
      bankCodes.add(item.bankCode);
      const questions = await fetchWukongQuestions(session, item);
      const rows = questions.map((question) =>
        mapWukongQuestionToImportRow(question, {
          bankCode: item.bankCode,
          categories: [item.title],
          sourceKey: item.sourceKey,
        }),
      );
      const imageNames = imageNamesForRows(rows);
      const images = [];
      for (const imageName of imageNames) {
        try {
          images.push(await downloadWukongImage(imageName, session));
        } catch {
          imageFailedCount++;
          errors.push(`图片下载失败：${imageName}`);
        }
      }

      const prepared = await prepareImportRowsWithImages(rowsSource, rows, images);
      const result = await commitImportRows(prisma, prepared.rows, {
        bankId: bank.id,
        skippedCount: prepared.skippedCount,
      });
      if (result.ok) {
        insertedCount += result.insertedCount;
        skippedCount += result.skippedCount;
      } else {
        errors.push(`${item.bankName}/${item.title}：${result.error}`);
      }
    }

    revalidatePath('/admin/questions');
    revalidatePath('/admin/questions/import/wukong');
    revalidatePath('/exam');
    return {
      ok: true,
      bankCount: bankCodes.size,
      insertedCount,
      skippedCount,
      imageFailedCount,
      errors,
    };
  } catch {
    return { ok: false, error: '导入失败，请稍后重试或减少勾选章节' };
  }
}

const rowsSource: ImportSource = {
  parse(input: unknown): ImportRow[] {
    return Array.isArray(input) ? (input as ImportRow[]) : [];
  },
};

async function upsertWukongBank(item: WukongCatalogItem): Promise<{ id: string }> {
  const mock = mockDefaults(item.subjectCode);
  return prisma.questionBank.upsert({
    where: { code: item.bankCode },
    update: {
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
    },
    create: {
      code: item.bankCode,
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
    },
    select: { id: true },
  });
}

function imageNamesForRows(rows: ImportRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    const value = row.imageUrl?.trim();
    if (!value || /^https?:\/\//i.test(value) || value.startsWith('/')) continue;
    names.add(value);
  }
  return Array.from(names);
}

function mockDefaults(subjectCode: string): { count: number; durationMs: number; passScore: number } {
  if (subjectCode === 'K4') return { count: 50, durationMs: 30 * 60 * 1000, passScore: 90 };
  if (subjectCode === 'TS') return { count: 100, durationMs: 30 * 60 * 1000, passScore: 90 };
  return { count: 100, durationMs: 45 * 60 * 1000, passScore: 90 };
}
