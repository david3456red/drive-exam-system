import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AnswerCard } from '@/app/exam/session/[attemptId]/answer-card';

describe('AnswerCard', () => {
  it('renders numbered jump buttons with visual states and attempt id', () => {
    render(
      <AnswerCard
        attemptId="attempt-1"
        items={[
          { number: 1, questionId: 'q1', outcome: 'correct', current: false, answered: true },
          { number: 2, questionId: 'q2', outcome: 'wrong', current: true, answered: true },
          { number: 3, questionId: 'q3', outcome: 'empty', current: true, answered: false },
          { number: 4, questionId: 'q4', outcome: 'answered', current: false, answered: true },
          { number: 5, questionId: 'q5', outcome: 'empty', current: false, answered: false },
        ]}
        action="/exam/session/jump"
      />,
    );

    const form = screen.getByRole('group', { name: '图形答题卡' });
    expect(within(form).getByDisplayValue('attempt-1')).toHaveAttribute(
      'name',
      'attemptId',
    );
    expect(screen.getByRole('button', { name: '第 1 题，回答正确' })).toHaveClass(
      'answer-card-cell-correct',
    );
    const currentWrong = screen.getByRole('button', { name: '第 2 题，当前试题，回答错误' });
    expect(currentWrong).toHaveClass('answer-card-cell-wrong');
    expect(currentWrong).toHaveClass('answer-card-cell-current');
    const currentEmpty = screen.getByRole('button', { name: '第 3 题，当前试题，未答' });
    expect(currentEmpty).toHaveClass('answer-card-cell-empty');
    expect(currentEmpty).toHaveClass('answer-card-cell-current');
    expect(screen.getByRole('button', { name: '第 4 题，已答' })).toHaveClass(
      'answer-card-cell-answered',
    );
    expect(screen.getByRole('button', { name: '第 5 题，未答' })).toHaveClass(
      'answer-card-cell-empty',
    );
  });
});
