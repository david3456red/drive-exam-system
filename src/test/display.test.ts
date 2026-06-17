import { describe, expect, it } from 'vitest';

import { formatDuration } from '@/lib/display';

describe('formatDuration', () => {
  it('keeps minute-second display for durations under one hour', () => {
    expect(formatDuration(4 * 60 * 1000 + 53 * 1000)).toBe('04:53');
  });

  it('includes hours for long-running attempts', () => {
    const ms = ((67 * 60 + 40) * 60 + 28) * 1000;

    expect(formatDuration(ms)).toBe('67:40:28');
  });
});
