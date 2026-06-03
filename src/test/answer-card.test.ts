import { describe, expect, it } from 'vitest';

import { buildAnswerCardItems } from '@/lib/exam-engine/answer-card';

describe('buildAnswerCardItems', () => {
  it('uses current state as the visual priority over correctness', () => {
    const items = buildAnswerCardItems({
      order: ['q1', 'q2', 'q3'],
      currentIndex: 1,
      records: [
        { questionId: 'q1', isCorrect: true },
        { questionId: 'q2', isCorrect: false },
      ],
      revealCorrectness: true,
    });

    expect(items.map((item) => item.state)).toEqual([
      'correct',
      'current',
      'empty',
    ]);
  });

  it('shows practice answers as correct or wrong when correctness is revealed', () => {
    const items = buildAnswerCardItems({
      order: ['q1', 'q2', 'q3'],
      currentIndex: 2,
      records: [
        { questionId: 'q1', isCorrect: true },
        { questionId: 'q2', isCorrect: false },
      ],
      revealCorrectness: true,
    });

    expect(items).toEqual([
      { number: 1, questionId: 'q1', state: 'correct', answered: true },
      { number: 2, questionId: 'q2', state: 'wrong', answered: true },
      { number: 3, questionId: 'q3', state: 'current', answered: false },
    ]);
  });

  it('shows mock answers as answered without exposing correctness', () => {
    const items = buildAnswerCardItems({
      order: ['q1', 'q2', 'q3'],
      currentIndex: 2,
      records: [
        { questionId: 'q1', isCorrect: true },
        { questionId: 'q2', isCorrect: false },
      ],
      revealCorrectness: false,
    });

    expect(items).toEqual([
      { number: 1, questionId: 'q1', state: 'answered', answered: true },
      { number: 2, questionId: 'q2', state: 'answered', answered: true },
      { number: 3, questionId: 'q3', state: 'current', answered: false },
    ]);
  });
});
