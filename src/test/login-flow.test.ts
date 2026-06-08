import { describe, expect, it } from 'vitest';

import {
  canUsePublicPracticeLinks,
  loginFailurePath,
  loginSuccessPath,
  readLoginEntry,
} from '@/lib/login-flow';

describe('login flow helpers', () => {
  it('keeps admin login failures on the admin login page', () => {
    expect(loginFailurePath(readLoginEntry('admin'))).toBe('/admin/login');
  });

  it('defaults unknown login entries to the student login page', () => {
    expect(loginFailurePath(readLoginEntry(null))).toBe('/login');
    expect(loginFailurePath(readLoginEntry('student'))).toBe('/login');
    expect(loginFailurePath(readLoginEntry('https://example.test/admin'))).toBe('/login');
  });

  it('allows staff roles to enter the admin backend only from the admin login entry', () => {
    expect(loginSuccessPath('admin', 'teacher')).toBe('/admin');
    expect(loginSuccessPath('admin', 'admin')).toBe('/admin');
    expect(loginSuccessPath('admin', 'super_admin')).toBe('/admin');
    expect(loginSuccessPath('student', 'admin')).toBeNull();
  });

  it('keeps student roles on the student portal and rejects them from admin login', () => {
    expect(loginSuccessPath('student', 'student_normal')).toBe('/exam');
    expect(loginSuccessPath('student', 'student_strict')).toBe('/exam');
    expect(loginSuccessPath('admin', 'student_normal')).toBeNull();
  });

  it('allows public practice links only for guests and student roles', () => {
    expect(canUsePublicPracticeLinks(null)).toBe(true);
    expect(canUsePublicPracticeLinks('student_normal')).toBe(true);
    expect(canUsePublicPracticeLinks('admin')).toBe(false);
    expect(canUsePublicPracticeLinks('teacher')).toBe(false);
  });
});
