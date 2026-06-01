import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSessionSecret } from '@/lib/session';

describe('getSessionSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects missing AUTH_SECRET in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', '');

    expect(() => getSessionSecret()).toThrow('AUTH_SECRET');
  });

  it('rejects placeholder AUTH_SECRET in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', 'replace-with-openssl-rand-base64-32');

    expect(() => getSessionSecret()).toThrow('AUTH_SECRET');
  });
});
