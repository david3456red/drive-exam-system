import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  examAttempt: {
    findFirst: vi.fn(),
  },
  examRecord: {
    findMany: vi.fn(),
  },
  question: {
    findUnique: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/server-session', () => ({
  requireUser: vi.fn(() => ({
    id: 'student-1',
    username: 'student',
    name: null,
    roleCode: 'student_normal',
    permissionCodes: ['exam:practice'],
  })),
}));

vi.mock('@/app/exam/actions', () => ({
  abandonAttemptAction: '/exam/abandon',
  finishAttemptAction: '/exam/finish',
  goToQuestionAction: '/exam/jump',
  submitAnswerAction: '/exam/submit',
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

import SessionPage from '@/app/exam/session/[attemptId]/page';

describe('SessionPage question numbering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the session ordinal instead of a raw question id suffix', async () => {
    const rawQuestionId = 'question-uuid-123456';

    prismaMock.examAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      userId: 'student-1',
      bankId: 'bank-1',
      bank: null,
      mode: 'SEQUENTIAL',
      status: 'ONGOING',
      questionOrder: JSON.stringify(['question-uuid-000001', rawQuestionId, 'question-uuid-000003']),
      currentIndex: 1,
      categoryIds: '[]',
      expiresAt: null,
      startedAt: new Date(),
      finishedAt: null,
      totalCount: null,
      correctCount: null,
      score: null,
      durationMs: null,
    });
    prismaMock.question.findUnique.mockResolvedValue({
      id: rawQuestionId,
      bankId: 'bank-1',
      type: 'SINGLE',
      content: 'A sample question',
      imageUrl: null,
      options: JSON.stringify([
        { key: 'A', text: 'wrong' },
        { key: 'B', text: 'right' },
      ]),
      answer: 'B',
      explanation: null,
      sourceSite: 'wukong',
      sourceQuestionId: '987654',
      sourceMeta: null,
      tags: '[]',
      createdAt: new Date(),
    });
    prismaMock.examRecord.findMany.mockResolvedValue([]);

    render(
      await SessionPage({
        params: { attemptId: 'attempt-1' },
      }),
    );

    expect(screen.getByText('题号 2')).toBeInTheDocument();
    expect(screen.queryByText('题号 123456')).not.toBeInTheDocument();
    expect(screen.queryByText(/987654/)).not.toBeInTheDocument();
  });
});
