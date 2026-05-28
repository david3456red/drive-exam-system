import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { serializeOrder } from '@/lib/exam-engine/snapshot';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:./test.db' } },
});

let finalizeAttempt: typeof import('@/app/exam/actions').finalizeAttempt;

type Fixture = {
  userId: string;
  bankId: string;
  questionIds: string[];
};

beforeAll(async () => {
  ensureTestDatabaseFile();
  execSync('pnpm exec prisma db push --force-reset --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });
  ({ finalizeAttempt } = await import('@/app/exam/actions'));
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

describe('finalizeAttempt', () => {
  it('uses questionOrder length for non-mock partial submissions', async () => {
    const fixture = await seedFixture(3);
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
        costMs: 1200,
      },
    });

    await finalizeAttempt(attempt.id, fixture.userId, 'FINISHED');

    const stored = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(stored.status).toBe('FINISHED');
    expect(stored.totalCount).toBe(3);
    expect(stored.correctCount).toBe(1);
    expect(stored.score).toBe(33);
  });

  it('fills missing mock records before calculating statistics', async () => {
    const fixture = await seedFixture(3);
    const attempt = await prisma.examAttempt.create({
      data: {
        userId: fixture.userId,
        bankId: fixture.bankId,
        mode: 'MOCK',
        status: 'ONGOING',
        questionOrder: serializeOrder(fixture.questionIds),
        currentIndex: 1,
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
        costMs: 1200,
      },
    });

    await finalizeAttempt(attempt.id, fixture.userId, 'ABANDONED');

    const [stored, records] = await Promise.all([
      prisma.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } }),
      prisma.examRecord.findMany({ where: { attemptId: attempt.id } }),
    ]);
    expect(stored.status).toBe('ABANDONED');
    expect(stored.totalCount).toBe(3);
    expect(stored.correctCount).toBe(1);
    expect(stored.score).toBe(33);
    expect(records).toHaveLength(3);
    expect(records.filter((record) => record.userAnswer === '')).toHaveLength(2);
  });

  it('ignores records outside questionOrder when calculating score', async () => {
    const fixture = await seedFixture(2);
    const attempt = await prisma.examAttempt.create({
      data: {
        userId: fixture.userId,
        bankId: fixture.bankId,
        mode: 'SEQUENTIAL',
        status: 'ONGOING',
        questionOrder: serializeOrder([fixture.questionIds[0]!]),
        currentIndex: 0,
        categoryIds: '[]',
      },
    });
    await prisma.examRecord.createMany({
      data: [
        {
          attemptId: attempt.id,
          questionId: fixture.questionIds[0]!,
          userAnswer: 'B',
          isCorrect: true,
          costMs: 1200,
        },
        {
          attemptId: attempt.id,
          questionId: fixture.questionIds[1]!,
          userAnswer: 'B',
          isCorrect: true,
          costMs: 900,
        },
      ],
    });

    await finalizeAttempt(attempt.id, fixture.userId, 'FINISHED');

    const stored = await prisma.examAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(stored.totalCount).toBe(1);
    expect(stored.correctCount).toBe(1);
    expect(stored.score).toBe(100);
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
