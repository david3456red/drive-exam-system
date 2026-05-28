import { describe, expect, it } from 'vitest';

import {
  createSessionToken,
  homeForRole,
  verifySessionToken,
  type SessionUser,
} from '@/lib/session';

const user: SessionUser = {
  id: 'user_1',
  username: 'driver',
  name: 'Driver One',
  roleCode: 'student_normal',
  permissionCodes: ['exam:practice', 'stats:self'],
};

describe('session helpers', () => {
  it('round-trips a signed session token', () => {
    const token = createSessionToken(user, 'test-secret', 60);

    expect(verifySessionToken(token, 'test-secret')).toMatchObject(user);
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken(user, 'test-secret', 60);

    expect(verifySessionToken(token, 'wrong-secret')).toBeNull();
  });

  it('routes staff and students to their own portals', () => {
    expect(homeForRole('student_strict')).toBe('/exam');
    expect(homeForRole('student_normal')).toBe('/exam');
    expect(homeForRole('teacher')).toBe('/admin');
    expect(homeForRole('admin')).toBe('/admin');
    expect(homeForRole('super_admin')).toBe('/admin');
  });
});
