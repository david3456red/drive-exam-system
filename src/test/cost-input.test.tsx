import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CostInput } from '@/app/exam/session/[attemptId]/cost-input';

describe('CostInput', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes elapsed milliseconds when the answer form is submitted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const { container, getByTestId } = render(
      <form data-testid="answer-form">
        <CostInput />
      </form>,
    );

    vi.setSystemTime(new Date(2500));
    fireEvent.submit(getByTestId('answer-form'));

    const input = container.querySelector<HTMLInputElement>('input[name="costMs"]');
    expect(input?.value).toBe('2500');
  });
});
