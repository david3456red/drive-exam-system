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

    expect(result).toEqual({ ok: true, insertedCount: 2, updatedCount: 0, skippedCount: 1 });

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

    expect(result).toEqual({ ok: true, insertedCount: 1, updatedCount: 0, skippedCount: 0 });

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

    expect(result).toEqual({ ok: true, insertedCount: 1, updatedCount: 0, skippedCount: 0 });

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

    expect(result).toEqual({ ok: true, insertedCount: 1, updatedCount: 0, skippedCount: 0 });
    const question = await prisma.question.findFirstOrThrow();
 expect(question.imageUrl).toBe('/uploads/questions/integration-image.png');
 });

 it('skips rows already imported from the same source within the target bank', async () => {
 await prisma.question.create({
 data: {
 bankId,
 type: 'SINGLE',
 content: 'existing source question',
 imageUrl: null,
 options: JSON.stringify([
 { key: 'A', text: 'wrong' },
 { key: 'B', text: 'right' },
 ]),
 answer: 'B',
 explanation: null,
 tags: JSON.stringify([]),
 sourceSite: 'wukong',
 sourceQuestionId: '6922',
 sourceMeta: JSON.stringify({ sourceKey: 'C1:K1:21:113' }),
 },
 });

 const result = await commitImportRows(prisma, [
 {
 type: 'SINGLE',
 content: 'incoming duplicate',
 optionA: 'wrong',
 optionB: 'right',
 answer: 'B',
 categories: [],
 tags: [],
 bankCode,
 sourceSite: 'wukong',
 sourceQuestionId: '6922',
 sourceMeta: JSON.stringify({ sourceKey: 'C1:K1:21:113' }),
 },
 ], { bankId });

 expect(result).toEqual({ ok: true, insertedCount: 0, updatedCount: 0, skippedCount: 1 });
 expect(await prisma.question.count()).toBe(1);
 });

 it('updates rows already imported from the same source when requested', async () => {
 const existingCategory = await prisma.category.create({ data: { name: 'old category' } });
 const question = await prisma.question.create({
 data: {
 bankId,
 type: 'SINGLE',
 content: 'existing source question',
 imageUrl: '/uploads/questions/old.png',
 options: JSON.stringify([
 { key: 'A', text: 'wrong' },
 { key: 'B', text: 'right' },
 ]),
 answer: 'B',
 explanation: null,
 tags: JSON.stringify(['old']),
 sourceSite: 'wukong',
 sourceQuestionId: '6922',
 sourceMeta: JSON.stringify({ sourceKey: 'C1:K1:21:113' }),
 categories: { create: { categoryId: existingCategory.id } },
 },
 });

 const result = await commitImportRows(prisma, [
 {
 type: 'SINGLE',
 content: 'updated source question',
 optionA: 'new wrong',
 optionC: 'new right',
 answer: 'C',
 categories: ['new category'],
 explanation: 'updated explanation',
 tags: ['wukong', 'updated'],
 bankCode,
 sourceSite: 'wukong',
 sourceQuestionId: '6922',
 sourceMeta: JSON.stringify({ sourceKey: 'C1:K1:21:113:-:hm' }),
 },
 ], {
 bankId,
 duplicateStrategy: 'update',
 preserveExistingImageOnUpdate: true,
 });

 expect(result).toEqual({ ok: true, insertedCount: 0, updatedCount: 1, skippedCount: 0 });
 const updated = await prisma.question.findUniqueOrThrow({
 where: { id: question.id },
 include: { categories: { include: { category: true } } },
 });
 expect(updated.content).toBe('updated source question');
 expect(updated.answer).toBe('C');
 expect(updated.imageUrl).toBe('/uploads/questions/old.png');
 expect(JSON.parse(updated.options)).toEqual([
 { key: 'A', text: 'new wrong' },
 { key: 'C', text: 'new right' },
 ]);
 expect(updated.categories.map((item) => item.category.name)).toEqual(['new category']);
 });

 it('fills a missing image when an imported source row updates with an image', async () => {
 await prisma.question.create({
 data: {
 bankId,
 type: 'SINGLE',
 content: 'existing source question without image',
 imageUrl: null,
 options: JSON.stringify([
 { key: 'A', text: 'wrong' },
 { key: 'B', text: 'right' },
 ]),
 answer: 'B',
 explanation: null,
 tags: JSON.stringify(['old']),
 sourceSite: 'wukong',
 sourceQuestionId: 'image-missing',
 },
 });

 const result = await commitImportRows(prisma, [
 {
 type: 'SINGLE',
 content: 'updated source question with image',
 imageUrl: '/uploads/questions/new.png',
 optionA: 'wrong',
 optionB: 'right',
 answer: 'B',
 categories: [],
 tags: ['wukong'],
 sourceSite: 'wukong',
 sourceQuestionId: 'image-missing',
 },
 ], {
 bankId,
 duplicateStrategy: 'update',
 preserveExistingImageOnUpdate: true,
 });

 expect(result).toEqual({ ok: true, insertedCount: 0, updatedCount: 1, skippedCount: 0 });
 const updated = await prisma.question.findFirstOrThrow({
 where: { sourceQuestionId: 'image-missing' },
 });
 expect(updated.imageUrl).toBe('/uploads/questions/new.png');
 });

 it('keeps an existing image when an imported source row updates with another image', async () => {
 await prisma.question.create({
 data: {
 bankId,
 type: 'SINGLE',
 content: 'existing source question with image',
 imageUrl: '/uploads/questions/old.png',
 options: JSON.stringify([
 { key: 'A', text: 'wrong' },
 { key: 'B', text: 'right' },
 ]),
 answer: 'B',
 explanation: null,
 tags: JSON.stringify(['old']),
 sourceSite: 'wukong',
 sourceQuestionId: 'image-existing',
 },
 });

 const result = await commitImportRows(prisma, [
 {
 type: 'SINGLE',
 content: 'updated source question with replacement image',
 imageUrl: '/uploads/questions/new.png',
 optionA: 'wrong',
 optionB: 'right',
 answer: 'B',
 categories: [],
 tags: ['wukong'],
 sourceSite: 'wukong',
 sourceQuestionId: 'image-existing',
 },
 ], {
 bankId,
 duplicateStrategy: 'update',
 preserveExistingImageOnUpdate: true,
 });

 expect(result).toEqual({ ok: true, insertedCount: 0, updatedCount: 1, skippedCount: 0 });
 const updated = await prisma.question.findFirstOrThrow({
 where: { sourceQuestionId: 'image-existing' },
 });
 expect(updated.imageUrl).toBe('/uploads/questions/old.png');
 });

 it('can merge categories when updating an imported source row', async () => {
 const existingCategory = await prisma.category.create({ data: { name: 'chapter one' } });
 const question = await prisma.question.create({
 data: {
 bankId,
 type: 'SINGLE',
 content: 'source question',
 imageUrl: null,
 options: JSON.stringify([
 { key: 'A', text: 'wrong' },
 { key: 'B', text: 'right' },
 ]),
 answer: 'B',
 explanation: null,
 tags: JSON.stringify(['old']),
 sourceSite: 'wukong',
 sourceQuestionId: '7000',
 categories: { create: { categoryId: existingCategory.id } },
 },
 });

 const result = await commitImportRows(prisma, [
 {
 type: 'SINGLE',
 content: 'source question',
 optionA: 'wrong',
 optionB: 'right',
 answer: 'B',
 categories: ['chapter two'],
 tags: ['wukong'],
 sourceSite: 'wukong',
 sourceQuestionId: '7000',
 },
 ], { bankId, duplicateStrategy: 'update', categoryStrategy: 'merge' });

 expect(result).toEqual({ ok: true, insertedCount: 0, updatedCount: 1, skippedCount: 0 });
 const links = await prisma.questionCategory.findMany({
 where: { questionId: question.id },
 include: { category: true },
 orderBy: { category: { name: 'asc' } },
 });
 expect(links.map((item) => item.category.name)).toEqual(['chapter one', 'chapter two']);
 });
});
