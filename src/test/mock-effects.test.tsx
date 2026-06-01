import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MockEffects } from '@/app/exam/session/[attemptId]/mock-effects';

describe('MockEffects', () => {
  const originalSendBeacon = navigator.sendBeacon;

  afterEach(() => {
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: originalSendBeacon,
    });
  });

  it('does not abandon a mock exam during normal form submission', () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const { getByTestId } = render(
      <>
        <form data-testid="answer-form">
          <button type="submit">submit</button>
        </form>
        <MockEffects attemptId="attempt-1" expiresAt={expiresAt} />
      </>,
    );

    fireEvent.submit(getByTestId('answer-form'));
    window.dispatchEvent(new Event('beforeunload'));

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('abandons a mock exam when the page unloads without form submission', () => {
    const sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    render(<MockEffects attemptId="attempt-1" expiresAt={expiresAt} />);

    window.dispatchEvent(new Event('beforeunload'));

    expect(sendBeacon).toHaveBeenCalledWith(
      '/api/exam/abandon',
      JSON.stringify({ attemptId: 'attempt-1' }),
    );
  });
});
