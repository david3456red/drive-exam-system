import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { serializeOrder } from '@/lib/exam-engine/snapshot';

const authState = vi.hoisted(() => ({
  user: {
    id: '',
    username: 'student',
    name: null,
    roleCode: 'student_normal',
    permissionCodes: ['exam:practice', 'exam:mock'],
  },
}));

vi.mock('@/lib/server-session', () => ({
  requireUser: vi.fn(() => authState.user),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

type Fixture = {
  userId: string;
  bankId: string;
  questionIds: string[];
};

let actions: typeof import('@/app/exam/actions');

beforeAll(async () => {
  ensureTestDatabaseFile();
  execSync('pnpm exec prisma db push --force-reset --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });
  actions = await import('@/app/exam/actions');
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
  authState.user.id = '';
});

describe('answer navigation actions', () => {
  it('jumps to the selected question in the attempt snapshot', async () => {
    const fixture = await seedFixture(3);
    authState.user.id = fixture.userId;
    const attempt = await prisma.examAttempt.create({
      data: {
        userId: fixture.userId,
        bankId: fixture.bankId,
        mode: 'SEQUENTIAL',
        status: 'ONGOING',
        questionOrder: serializeOrder(fixture.questionIds),
        currentIndex: 0,
        categoryIds: '[]',
      },
    });
    const formData = new FormData();
    formData.set('attemptId', attempt.id);
    formData.set('questionId', fixture.questionIds[2]!);

    await expect(actions.goToQuestionAction(formData)).rejects.toThrow(
      `REDIRECT:/exam/session/${attempt.id}`,
    );

    const stored = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(stored.currentIndex).toBe(2);
  });

  it('updates an existing mock answer instead of rejecting a duplicate submission', async () => {
    const fixture = await seedFixture(2);
    authState.user.id = fixture.userId;
    const attempt = await prisma.examAttempt.create({
      data: {
        userId: fixture.userId,
        bankId: fixture.bankId,
        mode: 'MOCK',
        status: 'ONGOING',
        questionOrder: serializeOrder(fixture.questionIds),
        currentIndex: 0,
        categoryIds: '[]',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.examRecord.create({
      data: {
        attemptId: attempt.id,
        questionId: fixture.questionIds[0]!,
        userAnswer: 'A',
        isCorrect: false,
        costMs: 100,
      },
    });
    const formData = new FormData();
    formData.set('attemptId', attempt.id);
    formData.set('questionId', fixture.questionIds[0]!);
    formData.set('answer', 'B');
    formData.set('costMs', '900');

    await expect(actions.submitAnswerAction(formData)).rejects.toThrow(
      `REDIRECT:/exam/session/${attempt.id}`,
    );

    const records = await prisma.examRecord.findMany({
      where: { attemptId: attempt.id, questionId: fixture.questionIds[0]! },
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      userAnswer: 'B',
      isCorrect: true,
      costMs: 900,
    });
    const stored = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(stored.status).toBe('ONGOING');
    expect(stored.currentIndex).toBe(1);
    await expect(
      prisma.wrongQuestion.count({ where: { userId: fixture.userId } }),
    ).resolves.toBe(0);
  });

  it('keeps a practice attempt ongoing after the final unanswered question is submitted', async () => {
    const fixture = await seedFixture(2);
    authState.user.id = fixture.userId;
    const attempt = await prisma.examAttempt.create({
      data: {
        userId: fixture.userId,
        bankId: fixture.bankId,
        mode: 'SEQUENTIAL',
        status: 'ONGOING',
        questionOrder: serializeOrder(fixture.questionIds),
        currentIndex: 1,
        categoryIds: '[]',
      },
    });
    await prisma.examRecord.create({
      data: {
        attemptId: attempt.id,
        questionId: fixture.questionIds[0]!,
        userAnswer: 'B',
        isCorrect: true,
        costMs: 100,
      },
    });
    const formData = new FormData();
    formData.set('attemptId', attempt.id);
    formData.set('questionId', fixture.questionIds[1]!);
    formData.set('answer', 'B');
    formData.set('costMs', '300');

    await expect(actions.submitAnswerAction(formData)).rejects.toThrow(
      `REDIRECT:/exam/session/${attempt.id}`,
    );

    const stored = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(stored.status).toBe('ONGOING');
    expect(stored.finishedAt).toBeNull();
    expect(stored.currentIndex).toBe(1);
  });

  it('applies mock wrongbook effects once from final records on finish', async () => {
    const fixture = await seedFixture(2);
    authState.user.id = fixture.userId;
    const attempt = await prisma.examAttempt.create({
      data: {
        userId: fixture.userId,
        bankId: fixture.bankId,
        mode: 'MOCK',
        status: 'ONGOING',
        questionOrder: serializeOrder(fixture.questionIds),
        currentIndex: 0,
        categoryIds: '[]',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.examRecord.create({
      data: {
        attemptId: attempt.id,
        questionId: fixture.questionIds[0]!,
        userAnswer: 'B',
        isCorrect: true,
        costMs: 100,
      },
    });

    await actions.finalizeAttempt(attempt.id, fixture.userId, 'FINISHED');

    const wrongs = await prisma.wrongQuestion.findMany({
      where: { userId: fixture.userId },
      orderBy: { questionId: 'asc' },
    });
    expect(wrongs).toHaveLength(1);
    expect(wrongs[0]).toMatchObject({
      questionId: fixture.questionIds[1]!,
      wrongCount: 1,
      rightCount: 0,
      mastered: false,
    });
  });
});

async function seedFixture(questionCount: number): Promise<Fixture> {
  const role = await prisma.role.create({
    data: { code: 'student_normal', name: '普通学员', strictLogin: false, isSystem: true },
  });
  const user = await prisma.user.create({
    data: {
      username: 'student',
      passwordHash: 'hash',
      roleId: role.id,
      status: 'ACTIVE',
    },
  });
  const bank = await prisma.questionBank.create({
    data: { code: 'session_bank', name: 'Session Bank', isBuiltin: false },
  });
  const questions = await Promise.all(
    Array.from({ length: questionCount }, (_, index) =>
      prisma.question.create({
        data: {
          bankId: bank.id,
          type: 'SINGLE',
          content: `question ${index + 1}`,
          options: JSON.stringify([
            { key: 'A', text: 'wrong' },
            { key: 'B', text: 'right' },
          ]),
          answer: 'B',
          explanation: null,
          tags: '[]',
        },
      }),
    ),
  );
  return {
    userId: user.id,
    bankId: bank.id,
    questionIds: questions.map((question) => question.id),
  };
}

function ensureTestDatabaseFile(): void {
  const testDbPath = path.join(process.cwd(), 'prisma', 'test.db');
  mkdirSync(path.dirname(testDbPath), { recursive: true });
  if (!existsSync(testDbPath)) {
    writeFileSync(testDbPath, '');
  }
}
