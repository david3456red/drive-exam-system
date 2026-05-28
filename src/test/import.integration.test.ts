import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { commitImport } from '@/lib/import';
import { jsonSource } from '@/lib/import/json-source';

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./test.db' } },
});

const bankCode = 'import_bank';
let bankId = '';

beforeAll(async () => {
  ensureTestDatabaseFile();
  execSync('pnpm exec prisma db push --force-reset --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });
});

afterAll(async () => {
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
});
