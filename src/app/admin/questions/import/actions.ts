'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { commitImport, previewImport } from '@/lib/import';
import { excelSource } from '@/lib/import/excel-source';
import { jsonSource } from '@/lib/import/json-source';
import type { CommitResult, PreviewResult } from '@/lib/import/types';
import { requireUser } from '@/lib/server-session';

export async function previewJsonImportAction(payload: string): Promise<PreviewResult> {
  requireUser('question:import');
  return previewImport(jsonSource, payload);
}

export async function previewExcelImportAction(bytes: number[]): Promise<PreviewResult> {
  requireUser('question:import');
  return previewImport(excelSource, bytes);
}

export async function commitJsonImportAction(
  payload: string,
  bankId: string,
): Promise<CommitResult> {
  requireUser('question:import');
  const result = await commitImport(prisma, jsonSource, payload, { bankId });
  revalidateQuestions(result);
  return result;
}

export async function commitExcelImportAction(
  bytes: number[],
  bankId: string,
): Promise<CommitResult> {
  requireUser('question:import');
  const result = await commitImport(prisma, excelSource, bytes, { bankId });
  revalidateQuestions(result);
  return result;
}

function revalidateQuestions(result: CommitResult): void {
  if (result.ok && result.insertedCount > 0) {
    revalidatePath('/admin/questions');
    revalidatePath('/admin/questions/import');
    revalidatePath('/exam');
  }
}
