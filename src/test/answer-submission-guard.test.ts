import { describe, expect, it } from 'vitest';

import { resolveSubmittedQuestion } from '@/lib/exam-engine/submission-guard';

describe('resolveSubmittedQuestion', () => {
  it('accepts a question only when it exists in the attempt snapshot', () => {
    expect(resolveSubmittedQuestion(['q1', 'q2'], 'q2')).toEqual({
      ok: true,
      index: 1,
    });
  });

  it('rejects a question outside the attempt snapshot', () => {
    expect(resolveSubmittedQuestion(['q1', 'q2'], 'q3')).toEqual({
      ok: false,
      reason: 'QUESTION_NOT_IN_ATTEMPT',
    });
  });
});
