import { describe, expect, it } from 'vitest';

import { buildAnswerCardItems } from '@/lib/exam-engine/answer-card';

describe('buildAnswerCardItems', () => {
  it('keeps correctness visible when an answered question is current', () => {
    const items = buildAnswerCardItems({
      order: ['q1', 'q2', 'q3'],
      currentIndex: 1,
      records: [
        { questionId: 'q1', isCorrect: true },
        { questionId: 'q2', isCorrect: false },
      ],
      revealCorrectness: true,
    });

    expect(items.map((item) => ({ outcome: item.outcome, current: item.current }))).toEqual([
      { outcome: 'correct', current: false },
      { outcome: 'wrong', current: true },
      { outcome: 'empty', current: false },
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
      { number: 1, questionId: 'q1', outcome: 'correct', current: false, answered: true },
      { number: 2, questionId: 'q2', outcome: 'wrong', current: false, answered: true },
      { number: 3, questionId: 'q3', outcome: 'empty', current: true, answered: false },
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
      { number: 1, questionId: 'q1', outcome: 'answered', current: false, answered: true },
      { number: 2, questionId: 'q2', outcome: 'answered', current: false, answered: true },
      { number: 3, questionId: 'q3', outcome: 'empty', current: true, answered: false },
    ]);
  });
});
