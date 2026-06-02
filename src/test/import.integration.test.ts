import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { commitImport, commitImportRows } from '@/lib/import';
import { prepareImportRowsWithImages, type ImportImageAttachment } from '@/lib/import/images';
import { jsonSource } from '@/lib/import/json-source';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./test.db' } },
});

const bankCode = 'import_bank';
let bankId = '';
const tempRoots: string[] = [];

beforeAll(async () => {
  ensureTestDatabaseFile();
  execSync('pnpm exec prisma db push --force-reset --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });
});

afterAll(async () => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.questionCategory.deleteMany();
  await prisma.question.deleteMany();
  await prisma.category.deleteMany();
  await prisma.questionBank.deleteMany();
  const bank = await prisma.questionBank.create({
    data: { code: bankCode, name: 'Import Bank', isBuiltin: false },
  });
  bankId = bank.id;
});

function ensureTestDatabaseFile(): void {
  const testDbPath = path.join(process.cwd(), 'prisma', 'test.db');
  mkdirSync(path.dirname(testDbPath), { recursive: true });
  if (!existsSync(testDbPath)) {
    writeFileSync(testDbPath, '');
  }
}

function makeTempPublicRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'drive-import-integration-images-'));
  tempRoots.push(root);
  return root;
}

function image(name: string, bytes = [1, 2, 3]): ImportImageAttachment {
  return {
    name,
    type: 'image/png',
    size: bytes.length,
    bytes,
  };
}

describe('commitImport', () => {
  it('imports valid rows, skips invalid rows, and reuses categories by name', async () => {
    const result = await commitImport(prisma, jsonSource, [
      {
        type: 'SINGLE',
        content: 'first question',
        optionA: 'wrong',
        optionB: 'right',
        answer: 'B',
        categories: ['shared'],
        tags: ['json'],
      },
      {
        type: 'MULTI',
        content: 'second question',
        optionA: 'slow down',
        optionB: 'watch mirrors',
        answer: 'AB',
        categories: ['shared'],
        tags: ['multi'],
      },
      {
        type: 'SINGLE',
        content: 'invalid question',
        optionA: 'only option',
        answer: 'C',
        categories: ['skipped'],
        tags: [],
      },
    ], { bankId });

    expect(result).toEqual({ ok: true, insertedCount: 2, skippedCount: 1 });

    expect(await prisma.question.count()).toBe(2);
    expect(await prisma.category.count()).toBe(1);
    expect(await prisma.questionCategory.count()).toBe(2);

    const stored = await prisma.question.findMany({ orderBy: { content: 'asc' } });
    expect(stored.map((question) => question.bankId)).toEqual([bankId, bankId]);
    expect(JSON.parse(stored[0]!.tags)).toEqual(['json']);
  });

  it('uses row.bankCode when a default bank id is not supplied', async () => {
    const result = await commitImport(prisma, jsonSource, [
      {
        type: 'SINGLE',
        content: 'bank code question',
        optionA: 'wrong',
        optionB: 'right',
        answer: 'B',
        categories: [],
        tags: [],
        bankCode,
      },
    ]);

    expect(result).toEqual({ ok: true, insertedCount: 1, skippedCount: 0 });

    const question = await prisma.question.findFirstOrThrow();
    expect(question.bankId).toBe(bankId);
  });

  it('prefers the explicit default bank id over row.bankCode', async () => {
    const otherBank = await prisma.questionBank.create({
      data: { code: 'row_bank', name: 'Row Bank', isBuiltin: false },
    });

    const result = await commitImport(prisma, jsonSource, [
      {
        type: 'SINGLE',
        content: 'selected bank question',
        optionA: 'wrong',
        optionB: 'right',
        answer: 'B',
        categories: [],
        tags: [],
        bankCode: otherBank.code,
      },
    ], { bankId });

    expect(result).toEqual({ ok: true, insertedCount: 1, skippedCount: 0 });

    const question = await prisma.question.findFirstOrThrow();
    expect(question.bankId).toBe(bankId);
  });

  it('commits prepared image rows with generated public upload URLs', async () => {
    const prepared = await prepareImportRowsWithImages(
      jsonSource,
      [
        {
          type: 'SINGLE',
          content: 'image import question',
          imageUrl: 'stop.png',
          optionA: 'go',
          optionB: 'stop',
          answer: 'B',
          categories: [],
          tags: [],
        },
      ],
      [image('stop.png')],
      {
        publicRoot: makeTempPublicRoot(),
        randomId: () => 'integration-image',
      },
    );

    const result = await commitImportRows(prisma, prepared.rows, {
      bankId,
      skippedCount: prepared.skippedCount,
    });

    expect(result).toEqual({ ok: true, insertedCount: 1, skippedCount: 0 });
    const question = await prisma.question.findFirstOrThrow();
    expect(question.imageUrl).toBe('/uploads/questions/integration-image.png');
  });
});
