import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { DEFAULT_WUKONG_BANKS } from '@/lib/import/wukong';
import { syncWukongCatalog } from '@/lib/import/wukong/sync';

loadEnvFile(path.join(process.cwd(), '.env'));

const username = process.env.WUKONG_USERNAME?.trim();
const password = process.env.WUKONG_PASSWORD;

if (!username || !password) {
  console.error('[wukong:sync] 请通过 WUKONG_USERNAME 和 WUKONG_PASSWORD 提供悟空授权账号。');
  process.exit(1);
}

const prisma = new PrismaClient();
const startedAt = Date.now();
const selectedBankCodes = parseList(process.env.WUKONG_BANK_CODES);
const skipImages = readBoolean(process.env.WUKONG_SKIP_IMAGES);
const banks =
  selectedBankCodes.length > 0
    ? DEFAULT_WUKONG_BANKS.filter((bank) => selectedBankCodes.includes(bank.bankCode))
    : [...DEFAULT_WUKONG_BANKS];

if (selectedBankCodes.length > 0 && banks.length === 0) {
  console.error(`[wukong:sync] WUKONG_BANK_CODES 未匹配到可同步题库：${selectedBankCodes.join(',')}`);
  process.exit(1);
}

syncWukongCatalog({
  prisma,
  credentials: { username, password },
  banks,
  downloadImages: !skipImages,
  onProgress: (progress) => {
    console.log(
      `[wukong:sync] ${progress.chapterIndex}/${progress.chapterCount} ${progress.bankName} / ${progress.chapterTitle} (${progress.questionCount} 题)`,
    );
  },
})
  .then((result) => {
    if (!result.ok) {
      console.error(`[wukong:sync] ${result.error}`);
      process.exitCode = 1;
      return;
    }

    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      [
        `[wukong:sync] 完成，用时 ${seconds}s`,
        `题库 ${result.bankCount}`,
        `章节 ${result.chapterCount}`,
        `读取 ${result.questionCount} 题`,
        `带图 ${result.imageCount} 题`,
        `带解析 ${result.explanationCount} 题`,
        `新增 ${result.insertedCount}`,
        `更新 ${result.updatedCount}`,
        `跳过 ${result.skippedCount}`,
        `图片失败 ${result.imageFailedCount}`,
      ].join('，'),
    );
    if (result.errors.length > 0) {
      console.log(`[wukong:sync] 错误摘要：${result.errors.slice(0, 20).join('；')}`);
    }
  })
  .catch((error) => {
    console.error('[wukong:sync] 执行失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnvValue(match[2] ?? '');
  }
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readBoolean(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}
