import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { listWrongQuestions } from '@/lib/exam-engine/queries';

describe('exam query helpers', () => {
  it('returns answer and explanation for wrong question review', async () => {
    const lastWrongAt = new Date('2026-06-08T10:00:00.000Z');
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'wrong-1',
        questionId: 'question-1',
        mastered: false,
        wrongCount: 2,
        rightCount: 1,
        lastWrongAt,
        question: {
          content: '这一组交通警察手势是什么信号？',
          type: 'SINGLE',
          answer: 'C',
          explanation: '变道信号：右臂向前平伸。',
          bankId: 'bank-1',
          bank: { name: '小车科目一' },
        },
      },
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const prisma = {
      wrongQuestion: { findMany, count },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaClient;

    const result = await listWrongQuestions(prisma, {
      userId: 'student-1',
      page: 1,
      pageSize: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          question: expect.objectContaining({
            select: expect.objectContaining({
              answer: true,
              explanation: true,
            }),
          }),
        }),
      }),
    );
    expect(result).toEqual({
      items: [
        {
          id: 'wrong-1',
          questionId: 'question-1',
          questionContent: '这一组交通警察手势是什么信号？',
          questionType: 'SINGLE',
          answer: 'C',
          explanation: '变道信号：右臂向前平伸。',
          bankId: 'bank-1',
          bankName: '小车科目一',
          mastered: false,
          wrongCount: 2,
          rightCount: 1,
          lastWrongAt,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });
});
