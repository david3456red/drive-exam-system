import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OngoingAttemptActions } from '@/app/exam/ongoing-attempt-actions';

describe('OngoingAttemptActions', () => {
  it('renders continue and abandon controls for an ongoing wrong-review session', () => {
    render(
      <OngoingAttemptActions
        abandonAction="/abandon"
        attemptId="attempt_wrong"
        label="错题重做"
      />,
    );

    expect(screen.getByRole('link', { name: /继续错题重做/ })).toHaveAttribute(
      'href',
      '/exam/session/attempt_wrong',
    );
    expect(screen.getByRole('button', { name: /放弃/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue('attempt_wrong')).toHaveAttribute('name', 'attemptId');
  });
});
