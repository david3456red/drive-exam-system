'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { commitImportRows } from '@/lib/import';
import {
  prepareImportRowsWithImages,
  previewImportWithImages,
  type ImportImageAttachment,
} from '@/lib/import/images';
import { excelSource } from '@/lib/import/excel-source';
import { jsonSource } from '@/lib/import/json-source';
import type { CommitResult, PreviewResult } from '@/lib/import/types';
import { requireUser } from '@/lib/server-session';

export async function previewJsonImportAction(
  payload: string,
  images: ImportImageAttachment[] = [],
): Promise<PreviewResult> {
  requireUser('question:import');
  return previewImportWithImages(jsonSource, payload, images);
}

export async function previewExcelImportAction(
  bytes: number[],
  images: ImportImageAttachment[] = [],
): Promise<PreviewResult> {
  requireUser('question:import');
  return previewImportWithImages(excelSource, bytes, images);
}

export async function commitJsonImportAction(
  payload: string,
  bankId: string,
  images: ImportImageAttachment[] = [],
): Promise<CommitResult> {
  requireUser('question:import');
  const result = await commitImportWithImages(jsonSource, payload, bankId, images);
  revalidateQuestions(result);
  return result;
}

export async function commitExcelImportAction(
  bytes: number[],
  bankId: string,
  images: ImportImageAttachment[] = [],
): Promise<CommitResult> {
  requireUser('question:import');
  const result = await commitImportWithImages(excelSource, bytes, bankId, images);
  revalidateQuestions(result);
  return result;
}

async function commitImportWithImages(
  source: typeof jsonSource | typeof excelSource,
  payload: unknown,
  bankId: string,
  images: ImportImageAttachment[],
): Promise<CommitResult> {
  let prepared: Awaited<ReturnType<typeof prepareImportRowsWithImages>>;
  try {
    prepared = await prepareImportRowsWithImages(source, payload, images);
  } catch {
    return { ok: false, error: '图片保存失败，请检查文件后重试' };
  }

  return commitImportRows(prisma, prepared.rows, {
    bankId,
    skippedCount: prepared.skippedCount,
  });
}

function revalidateQuestions(result: CommitResult): void {
  if (result.ok && (result.insertedCount > 0 || result.updatedCount > 0)) {
    revalidatePath('/admin/questions');
    revalidatePath('/admin/questions/import');
    revalidatePath('/exam');
  }
}
