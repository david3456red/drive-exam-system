import { describe, expect, it } from 'vitest';

import { loginFailurePath, readLoginEntry } from '@/lib/login-flow';

describe('login flow helpers', () => {
  it('keeps admin login failures on the admin login page', () => {
    expect(loginFailurePath(readLoginEntry('admin'))).toBe('/admin/login');
  });

  it('defaults unknown login entries to the student login page', () => {
    expect(loginFailurePath(readLoginEntry(null))).toBe('/login');
    expect(loginFailurePath(readLoginEntry('student'))).toBe('/login');
    expect(loginFailurePath(readLoginEntry('https://example.test/admin'))).toBe('/login');
  });
});
