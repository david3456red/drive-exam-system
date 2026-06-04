import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';

const authState = vi.hoisted(() => ({
  user: {
    id: 'admin-user',
    username: 'admin',
    name: null,
    roleCode: 'admin',
    permissionCodes: ['question:write'],
  },
}));

vi.mock('@/lib/server-session', () => ({
  requireUser: vi.fn(() => authState.user),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

let actions: typeof import('@/app/admin/actions');

beforeAll(async () => {
  ensureTestDatabaseFile();
  execSync('pnpm exec prisma db push --force-reset --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });
  actions = await import('@/app/admin/actions');
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.examRecord.deleteMany();
  await prisma.examAttempt.deleteMany();
  await prisma.wrongQuestion.deleteMany();
  await prisma.questionCategory.deleteMany();
  await prisma.question.deleteMany();
  await prisma.category.deleteMany();
  await prisma.loginLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.questionBank.deleteMany();
});

describe('admin question edit actions', () => {
  it('creates a question with an uploaded image file', async () => {
    const fixture = await seedQuestionFixture();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const formData = new FormData();
    formData.set('bankId', fixture.primaryBankId);
    formData.set('type', 'SINGLE');
    formData.set('content', 'new uploaded-image question');
    formData.set('answer', 'A');
    formData.set('optionA', 'stop');
    formData.set('optionB', 'go');
    formData.append('categoryIds', fixture.primaryCategoryId);
    formData.set('imageFile', new File([bytes], 'traffic-sign.png', { type: 'image/png' }));

    await expect(actions.createQuestionAction(formData)).rejects.toThrow(
      /REDIRECT:\/admin\/questions\/.+\?notice=%E9%A2%98%E7%9B%AE%E5%B7%B2%E5%88%9B%E5%BB%BA/,
    );

    const stored = await prisma.question.findFirstOrThrow({
      where: { content: 'new uploaded-image question' },
      include: { categories: true },
    });
    expect(stored.imageUrl).toMatch(/^\/uploads\/questions\/.+\.png$/);
    expect(stored.categories.map((item) => item.categoryId)).toEqual([fixture.primaryCategoryId]);

    const imagePath = path.join(process.cwd(), 'public', stored.imageUrl!.replace(/^\//, ''));
    expect(readFileSync(imagePath)).toEqual(Buffer.from(bytes));
    rmSync(imagePath, { force: true });
  });

  it('encodes required-field create errors in redirect URLs', async () => {
    const formData = new FormData();

    await expect(actions.createQuestionAction(formData)).rejects.toThrow(
      `REDIRECT:/admin/questions/new?error=${encodeURIComponent('请填写题库、题型、题干和答案')}`,
    );
  });

  it('updates all fields for an unused question', async () => {
    const fixture = await seedQuestionFixture();
    const formData = editFormData({
      id: fixture.questionId,
      bankId: fixture.secondaryBankId,
      type: 'MULTI',
      content: 'updated lane-change question',
      answer: 'AB',
      optionA: 'check mirrors',
      optionB: 'signal first',
      optionC: 'accelerate hard',
      categoryIds: [fixture.secondaryCategoryId],
      explanation: 'Both observation and signal are required.',
      tags: 'updated|multi',
      imageUrl: '/uploads/questions/updated.png',
    });

    await expect(actions.updateQuestionAction(formData)).rejects.toThrow(
      /REDIRECT:\/admin\/questions\/.+\?notice=/,
    );

    const stored = await prisma.question.findUniqueOrThrow({
      where: { id: fixture.questionId },
      include: { categories: true },
    });
    expect(stored).toMatchObject({
      bankId: fixture.secondaryBankId,
      type: 'MULTI',
      content: 'updated lane-change question',
      answer: 'AB',
      imageUrl: '/uploads/questions/updated.png',
      explanation: 'Both observation and signal are required.',
    });
    expect(JSON.parse(stored.options)).toEqual([
      { key: 'A', text: 'check mirrors' },
      { key: 'B', text: 'signal first' },
      { key: 'C', text: 'accelerate hard' },
    ]);
    expect(JSON.parse(stored.tags)).toEqual(['updated', 'multi']);
    expect(stored.categories.map((item) => item.categoryId)).toEqual([fixture.secondaryCategoryId]);
  });

  it('keeps scoring fields unchanged for a used question while updating editable fields', async () => {
    const fixture = await seedQuestionFixture();
    await markQuestionUsed(fixture.questionId, fixture.primaryBankId);
    const formData = editFormData({
      id: fixture.questionId,
      bankId: fixture.secondaryBankId,
      type: 'MULTI',
      content: 'corrected typo in used question',
      answer: 'BC',
      optionB: 'tampered option',
      optionC: 'new option',
      categoryIds: [fixture.secondaryCategoryId],
      explanation: 'Corrected explanation.',
      tags: 'used|corrected',
      removeImage: true,
    });

    await expect(actions.updateQuestionAction(formData)).rejects.toThrow(
      /REDIRECT:\/admin\/questions\/.+\?notice=/,
    );

    const stored = await prisma.question.findUniqueOrThrow({
      where: { id: fixture.questionId },
      include: { categories: true },
    });
    expect(stored).toMatchObject({
      bankId: fixture.secondaryBankId,
      type: 'SINGLE',
      content: 'corrected typo in used question',
      answer: 'A',
      imageUrl: null,
      explanation: 'Corrected explanation.',
    });
    expect(JSON.parse(stored.options)).toEqual([
      { key: 'A', text: 'stop' },
      { key: 'B', text: 'go' },
    ]);
    expect(JSON.parse(stored.tags)).toEqual(['used', 'corrected']);
    expect(stored.categories.map((item) => item.categoryId)).toEqual([fixture.secondaryCategoryId]);
  });

  it('redirects back to edit page when an unused question update is invalid', async () => {
    const fixture = await seedQuestionFixture();
    const formData = editFormData({
      id: fixture.questionId,
      bankId: fixture.primaryBankId,
      type: 'SINGLE',
      content: 'invalid answer question',
      answer: 'C',
      optionA: 'only A',
      optionB: 'only B',
      categoryIds: [fixture.primaryCategoryId],
    });

    await expect(actions.updateQuestionAction(formData)).rejects.toThrow(
      `REDIRECT:/admin/questions/${fixture.questionId}/edit?error=`,
    );

    const stored = await prisma.question.findUniqueOrThrow({ where: { id: fixture.questionId } });
    expect(stored.content).toBe('original question');
    expect(stored.answer).toBe('A');
  });
});

type EditFormDataInput = {
  id: string;
  bankId: string;
  type: string;
  content: string;
  answer: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  optionE?: string;
  optionF?: string;
  categoryIds?: string[];
  explanation?: string;
  tags?: string;
  imageUrl?: string;
  removeImage?: boolean;
};

function editFormData(input: EditFormDataInput): FormData {
  const formData = new FormData();
  formData.set('id', input.id);
  formData.set('bankId', input.bankId);
  formData.set('type', input.type);
  formData.set('content', input.content);
  formData.set('answer', input.answer);
  for (const key of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    const value = input[`option${key}`];
    if (value) formData.set(`option${key}`, value);
  }
  for (const categoryId of input.categoryIds ?? []) {
    formData.append('categoryIds', categoryId);
  }
  if (input.explanation) formData.set('explanation', input.explanation);
  if (input.tags) formData.set('tags', input.tags);
  if (input.imageUrl) formData.set('imageUrl', input.imageUrl);
  if (input.removeImage) formData.set('removeImage', 'on');
  return formData;
}

async function seedQuestionFixture(): Promise<{
  primaryBankId: string;
  secondaryBankId: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
  questionId: string;
}> {
  const [primaryBank, secondaryBank] = await Promise.all([
    prisma.questionBank.create({ data: { code: 'primary', name: 'Primary Bank' } }),
    prisma.questionBank.create({ data: { code: 'secondary', name: 'Secondary Bank' } }),
  ]);
  const [primaryCategory, secondaryCategory] = await Promise.all([
    prisma.category.create({ data: { name: 'Rules' } }),
    prisma.category.create({ data: { name: 'Signs' } }),
  ]);
  const question = await prisma.question.create({
    data: {
      bankId: primaryBank.id,
      type: 'SINGLE',
      content: 'original question',
      imageUrl: '/uploads/questions/original.png',
      options: JSON.stringify([
        { key: 'A', text: 'stop' },
        { key: 'B', text: 'go' },
      ]),
      answer: 'A',
      explanation: 'Original explanation.',
      tags: JSON.stringify(['original']),
      categories: {
        create: { categoryId: primaryCategory.id },
      },
    },
  });

  return {
    primaryBankId: primaryBank.id,
    secondaryBankId: secondaryBank.id,
    primaryCategoryId: primaryCategory.id,
    secondaryCategoryId: secondaryCategory.id,
    questionId: question.id,
  };
}

async function markQuestionUsed(questionId: string, bankId: string): Promise<void> {
  const role = await prisma.role.create({ data: { code: 'student', name: 'Student' } });
  const user = await prisma.user.create({
    data: {
      username: 'student',
      passwordHash: 'hash',
      roleId: role.id,
    },
  });
  const attempt = await prisma.examAttempt.create({
    data: {
      userId: user.id,
      bankId,
      mode: 'SEQUENTIAL',
      status: 'FINISHED',
      questionOrder: JSON.stringify([questionId]),
      currentIndex: 0,
      categoryIds: '[]',
    },
  });
  await prisma.examRecord.create({
    data: {
      attemptId: attempt.id,
      questionId,
      userAnswer: 'A',
      isCorrect: true,
      costMs: 1000,
    },
  });
  await prisma.wrongQuestion.create({
    data: {
      userId: user.id,
      questionId,
      wrongCount: 1,
      rightCount: 0,
      mastered: false,
      lastWrongAt: new Date(),
    },
  });
}

function ensureTestDatabaseFile(): void {
  const testDbPath = path.join(process.cwd(), 'prisma', 'test.db');
  mkdirSync(path.dirname(testDbPath), { recursive: true });
  if (!existsSync(testDbPath)) {
    writeFileSync(testDbPath, '');
  }
}
