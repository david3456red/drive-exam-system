'use server';

import { revalidatePath } from 'next/cache';

import {
  DEFAULT_WUKONG_BANKS,
  loginWukong,
  scanWukongCatalog,
  type WukongCatalogItem,
} from '@/lib/import/wukong';
import { syncWukongCatalog, type WukongSyncResult } from '@/lib/import/wukong/sync';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/server-session';

export type WukongScanResult =
  | { ok: true; items: WukongCatalogItem[] }
  | { ok: false; error: string };

export type WukongImportResult = WukongSyncResult;

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
  const result = await syncWukongCatalog({
    prisma,
    credentials: { username, password },
    selections,
  });
  if (result.ok) {
    revalidatePath('/admin/questions');
    revalidatePath('/admin/questions/import/wukong');
    revalidatePath('/exam');
  }
  return result;
}
