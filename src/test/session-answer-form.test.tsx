import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuestionAnswerForm } from '@/app/exam/session/[attemptId]/answer-form';

const options = [
  { key: 'A', text: 'First option' },
  { key: 'B', text: 'Second option' },
];

describe('QuestionAnswerForm', () => {
  it('does not carry a selected answer to the next unanswered question', () => {
    const { rerender } = render(
      <QuestionAnswerForm
        attemptId="attempt-1"
        currentAnswer={undefined}
        questionId="q1"
        questionType="SINGLE"
        options={options}
      />,
    );

    fireEvent.click(screen.getByLabelText(/A\s*First option/));
    expect(screen.getByLabelText(/A\s*First option/)).toBeChecked();

    rerender(
      <QuestionAnswerForm
        attemptId="attempt-1"
        currentAnswer={undefined}
        questionId="q2"
        questionType="SINGLE"
        options={options}
      />,
    );

    expect(screen.getByLabelText(/A\s*First option/)).not.toBeChecked();
    expect(screen.getByLabelText(/B\s*Second option/)).not.toBeChecked();
  });
});
