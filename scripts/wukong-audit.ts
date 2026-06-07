import { existsSync, readFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import {
  DEFAULT_WUKONG_BANKS,
  WUKONG_SOURCE_SITE,
  downloadWukongImage,
  fetchWukongQuestions,
  loginWukong,
  mapWukongQuestionToImportRow,
  scanWukongCatalog,
  type WukongCatalogItem,
  type WukongQuestion,
} from '@/lib/import/wukong';
import {
  buildExpectedSnapshots,
  diffAuditSnapshots,
  hashFile,
  questionKey,
  resolveLocalImagePaths,
  selectSafePruneQuestions,
  sha256,
  type AuditDiff,
  type AuditQuestionSnapshot,
} from '@/lib/import/wukong/audit';
import type { ImportRow } from '@/lib/import/types';

type ImageCheckMode = 'none' | 'metadata' | 'hash';

type CliOptions = {
  checkImages: ImageCheckMode;
  safePrune: boolean;
  itemConcurrency: number;
  pageConcurrency: number;
  imageConcurrency: number;
};

type BankReportRow = {
  bankCode: string;
  bankName: string;
  chapters: number;
  officialRefs: number;
  fetchedRefs: number;
  duplicateRefs: number;
  expectedUnique: number;
  localUnique: number;
  missing: number;
  extra: number;
  fieldDiff: number;
  imageRefDiff: number;
  imageMissing: number;
  imageHashDiff: number;
};

loadEnvFile(path.join(process.cwd(), '.env'));

const credentials = readCredentials();
const options = parseCliOptions(process.argv.slice(2));
const prisma = new PrismaClient();
const startedAt = Date.now();

main()
  .catch((error) => {
    console.error('[wukong:audit] 执行失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

async function main(): Promise<void> {
  const session = await loginWukong(credentials);
  const catalog = await scanWukongCatalog(session, [...DEFAULT_WUKONG_BANKS]);
  const catalogByBank = new Map<string, { chapters: number; officialRefs: number; fetchedRefs: number }>();
  const expectedRows: ImportRow[] = [];

  await mapWithConcurrency(catalog, options.itemConcurrency, async (item, index) => {
    const questions = await fetchWukongQuestions(session, item, fetch, {
      pageConcurrency: options.pageConcurrency,
    });
    expectedRows.push(...questions.map((question) => mapQuestion(question, item)));
    const stats = catalogByBank.get(item.bankCode) ?? { chapters: 0, officialRefs: 0, fetchedRefs: 0 };
    stats.chapters += 1;
    stats.officialRefs += item.questionCount;
    stats.fetchedRefs += questions.length;
    catalogByBank.set(item.bankCode, stats);
    if ((index + 1) % 25 === 0 || index + 1 === catalog.length) {
      console.error(`[wukong:audit] 已读取章节 ${index + 1}/${catalog.length}`);
    }
  });

  const expectedResult = buildExpectedSnapshots(expectedRows);
  const expected = expectedResult.snapshots;
  const local = await loadLocalSnapshots();
  const baseDiffs = diffAuditSnapshots(expected, local);
  const imageResult = await checkImages(expected, local, session, options);
  const localByKey = new Map(local.map((item) => [item.key, item]));
  const expectedByBank = groupByBank(expected);
  const localByBank = groupByBank(local);
  const allDiffs = [...baseDiffs, ...imageResult.diffs];
  const extraKeys = new Set(baseDiffs.filter((diff) => diff.kind === 'extra').map((diff) => diff.key));
  const extras = local.filter((item) => extraKeys.has(item.key));
  const safePrune = selectSafePruneQuestions(extras);
  const prunedIds = options.safePrune ? await pruneSafeExtras(safePrune.safeDeleteIds, localByKey) : [];
  const prunedKeys = new Set(
    prunedIds
      .map((id) => local.find((item) => item.id === id)?.key)
      .filter((key): key is string => Boolean(key)),
  );
  const effectiveDiffs = allDiffs.filter((diff) => diff.kind !== 'extra' || !prunedKeys.has(diff.key));
  const rows = DEFAULT_WUKONG_BANKS.map((bank): BankReportRow => {
    const bankExpected = expectedByBank.get(bank.bankCode) ?? [];
    const bankLocal = localByBank.get(bank.bankCode) ?? [];
    const bankDiffs = effectiveDiffs.filter((diff) => diff.bankCode === bank.bankCode);
    const catalogStats = catalogByBank.get(bank.bankCode) ?? { chapters: 0, officialRefs: 0, fetchedRefs: 0 };

    return {
      bankCode: bank.bankCode,
      bankName: bank.bankName,
      chapters: catalogStats.chapters,
      officialRefs: catalogStats.officialRefs,
      fetchedRefs: catalogStats.fetchedRefs,
      duplicateRefs: catalogStats.fetchedRefs - bankExpected.length,
      expectedUnique: bankExpected.length,
      localUnique: bankLocal.length - bankLocal.filter((item) => prunedKeys.has(item.key)).length,
      missing: countDiff(bankDiffs, 'missing'),
      extra: countDiff(bankDiffs, 'extra'),
      fieldDiff: countDiff(bankDiffs, 'field'),
      imageRefDiff: countDiff(bankDiffs, 'imageRef'),
      imageMissing: countDiff(bankDiffs, 'imageMissing'),
      imageHashDiff: countDiff(bankDiffs, 'imageHash'),
    };
  });

  const report = {
    ok: effectiveDiffs.length === 0 && imageResult.downloadErrors.length === 0,
    seconds: Math.round((Date.now() - startedAt) / 1000),
    checkImages: options.checkImages,
    safePrune: options.safePrune,
    summary: {
      banks: rows.length,
      catalogChapters: catalog.length,
      expectedUnique: expected.length,
      localUnique: local.length - prunedKeys.size,
      duplicateRefs: expectedResult.duplicateCount,
      missing: countDiff(effectiveDiffs, 'missing'),
      extra: countDiff(effectiveDiffs, 'extra'),
      fieldDiff: countDiff(effectiveDiffs, 'field'),
      imageRefDiff: countDiff(effectiveDiffs, 'imageRef'),
      imageMissing: countDiff(effectiveDiffs, 'imageMissing'),
      imageHashDiff: countDiff(effectiveDiffs, 'imageHash'),
      imageChecked: imageResult.checked,
      imageDownloadErrors: imageResult.downloadErrors.length,
      safePruned: prunedIds.length,
      retainedExtras: safePrune.retained.length,
    },
    rows,
    samples: {
      missing: sampleDiffs(effectiveDiffs, 'missing'),
      extra: sampleDiffs(effectiveDiffs, 'extra'),
      field: sampleDiffs(effectiveDiffs, 'field'),
      imageRef: sampleDiffs(effectiveDiffs, 'imageRef'),
      imageMissing: sampleDiffs(effectiveDiffs, 'imageMissing'),
      imageHash: sampleDiffs(effectiveDiffs, 'imageHash'),
      imageDownloadErrors: imageResult.downloadErrors.slice(0, 20),
      retainedExtras: safePrune.retained.slice(0, 20).map((item) => ({
        key: item.key,
        hasRecords: item.hasRecords,
        hasWrongs: item.hasWrongs,
      })),
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}

function mapQuestion(question: WukongQuestion, item: WukongCatalogItem): ImportRow {
  return mapWukongQuestionToImportRow(question, {
    bankCode: item.bankCode,
    categories: [item.title],
    sourceKey: item.sourceKey,
  });
}

async function loadLocalSnapshots(): Promise<AuditQuestionSnapshot[]> {
  const rows = await prisma.question.findMany({
    where: { sourceSite: WUKONG_SOURCE_SITE },
    select: {
      id: true,
      sourceQuestionId: true,
      type: true,
      content: true,
      options: true,
      answer: true,
      explanation: true,
      imageUrl: true,
      sourceMeta: true,
      bank: { select: { code: true } },
      _count: { select: { records: true, wrongs: true } },
    },
  });

  return rows
    .filter((row) => row.sourceQuestionId)
    .map((row) => ({
      id: row.id,
      key: questionKey(row.bank.code, row.sourceQuestionId!),
      bankCode: row.bank.code,
      sourceQuestionId: row.sourceQuestionId!,
      type: row.type,
      content: row.content,
      options: row.options,
      answer: row.answer,
      explanation: row.explanation ?? null,
      imageName: imageNameFromSourceMeta(row.sourceMeta),
      imageUrl: row.imageUrl,
      hasRecords: row._count.records > 0,
      hasWrongs: row._count.wrongs > 0,
    }));
}

async function checkImages(
  expected: AuditQuestionSnapshot[],
  local: AuditQuestionSnapshot[],
  session: Awaited<ReturnType<typeof loginWukong>>,
  options: CliOptions,
): Promise<{ diffs: AuditDiff[]; checked: number; downloadErrors: string[] }> {
  if (options.checkImages === 'none') {
    return { diffs: [], checked: 0, downloadErrors: [] };
  }

  const diffs: AuditDiff[] = [];
  const downloadErrors: string[] = [];
  const localByKey = new Map(local.map((item) => [item.key, item]));
  const remoteHashByName = new Map<string, string>();
  let checked = 0;
  const withImages = expected.filter((item) => item.imageName);

  await mapWithConcurrency(withImages, options.imageConcurrency, async (item, index) => {
    const actual = localByKey.get(item.key);
    if (!actual) return;
    const paths = resolveLocalImagePaths(actual.imageUrl);
    if (paths.length === 0) {
      diffs.push({
        kind: 'imageMissing',
        key: item.key,
        bankCode: item.bankCode,
        sourceQuestionId: item.sourceQuestionId,
        imageUrl: actual.imageUrl,
      });
      return;
    }

    if (options.checkImages === 'hash') {
      const expectedHash = await remoteImageHash(item.imageName!, session, remoteHashByName, downloadErrors);
      if (!expectedHash) return;
      const actualHash = hashFile(paths[0]!);
      checked++;
      if (expectedHash !== actualHash) {
        diffs.push({
          kind: 'imageHash',
          key: item.key,
          bankCode: item.bankCode,
          sourceQuestionId: item.sourceQuestionId,
          expectedHash,
          actualHash,
        });
      }
    }

    if ((index + 1) % 500 === 0 || index + 1 === withImages.length) {
      console.error(`[wukong:audit] 已校验图片 ${index + 1}/${withImages.length}`);
    }
  });

  return { diffs, checked, downloadErrors };
}

async function remoteImageHash(
  imageName: string,
  session: Awaited<ReturnType<typeof loginWukong>>,
  cache: Map<string, string>,
  errors: string[],
): Promise<string | null> {
  const cached = cache.get(imageName);
  if (cached) return cached;

  try {
    const remote = await downloadWukongImage(imageName, session);
    const hash = sha256(Uint8Array.from(remote.bytes));
    cache.set(imageName, hash);
    return hash;
  } catch {
    errors.push(imageName);
    return null;
  }
}

async function pruneSafeExtras(
  safeDeleteIds: string[],
  localByKey: Map<string, AuditQuestionSnapshot>,
): Promise<string[]> {
  if (safeDeleteIds.length === 0) return [];
  const imageUrls = Array.from(
    new Set(
      Array.from(localByKey.values())
        .filter((item) => item.id && safeDeleteIds.includes(item.id))
        .map((item) => item.imageUrl)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const result = await prisma.question.deleteMany({
    where: {
      id: { in: safeDeleteIds },
      records: { none: {} },
      wrongs: { none: {} },
    },
  });
  const remaining = await prisma.question.findMany({
    where: { id: { in: safeDeleteIds } },
    select: { id: true },
  });
  const remainingIds = new Set(remaining.map((item) => item.id));
  const pruned = safeDeleteIds.filter((id) => !remainingIds.has(id)).slice(0, result.count);

  for (const imageUrl of imageUrls) {
    const stillUsed = await prisma.question.count({ where: { imageUrl } });
    if (stillUsed === 0) {
      await unlinkLocalImages(imageUrl);
    }
  }

  return pruned;
}

async function unlinkLocalImages(imageUrl: string): Promise<void> {
  const candidates = resolveLocalImagePaths(imageUrl);
  await Promise.all(
    candidates.map(async (filePath) => {
      try {
        await unlink(filePath);
      } catch {
        // Best-effort cleanup; the audit report is about DB/source parity.
      }
    }),
  );
}

function groupByBank(items: AuditQuestionSnapshot[]): Map<string, AuditQuestionSnapshot[]> {
  const out = new Map<string, AuditQuestionSnapshot[]>();
  for (const item of items) {
    const rows = out.get(item.bankCode) ?? [];
    rows.push(item);
    out.set(item.bankCode, rows);
  }
  return out;
}

function imageNameFromSourceMeta(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && 'imageName' in parsed && typeof parsed.imageName === 'string') {
      return parsed.imageName;
    }
  } catch {
    return null;
  }
  return null;
}

function countDiff(diffs: readonly AuditDiff[], kind: AuditDiff['kind']): number {
  return diffs.filter((diff) => diff.kind === kind).length;
}

function sampleDiffs(diffs: readonly AuditDiff[], kind: AuditDiff['kind']): AuditDiff[] {
  return diffs.filter((diff) => diff.kind === kind).slice(0, 20);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex++;
      out[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, () => worker()),
  );
  return out;
}

function parseCliOptions(args: string[]): CliOptions {
  return {
    checkImages: readImageCheck(args.find((arg) => arg.startsWith('--check-images='))?.split('=')[1]),
    safePrune: args.includes('--safe-prune'),
    itemConcurrency: readPositiveInt(args, '--item-concurrency', 6),
    pageConcurrency: readPositiveInt(args, '--page-concurrency', 8),
    imageConcurrency: readPositiveInt(args, '--image-concurrency', 4),
  };
}

function readImageCheck(value: string | undefined): ImageCheckMode {
  if (value === 'none' || value === 'metadata' || value === 'hash') return value;
  return 'hash';
}

function readPositiveInt(args: string[], name: string, fallback: number): number {
  const raw = args.find((arg) => arg.startsWith(`${name}=`))?.split('=')[1];
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readCredentials(): { username: string; password: string } {
  const username = process.env.WUKONG_USERNAME?.trim();
  const password = process.env.WUKONG_PASSWORD;
  if (!username || !password) {
    console.error('[wukong:audit] 请通过 WUKONG_USERNAME 和 WUKONG_PASSWORD 提供悟空授权账号。');
    process.exit(1);
  }
  return { username, password };
}

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
