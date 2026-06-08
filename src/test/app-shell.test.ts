import { describe, expect, test } from 'vitest';

import { buildShellNav } from '@/components/app-shell';
import type { SessionUser } from '@/lib/session';

function user(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'user-1',
    username: 'demo',
    name: 'Demo',
    roleCode: 'student_normal',
    permissionCodes: [],
    ...overrides,
  };
}

describe('buildShellNav', () => {
  test('hides admin entry points on public pages', () => {
    expect(buildShellNav(null, { isAdminPath: false }).map((item) => item.href)).toEqual([
      '/login',
    ]);

    const items = buildShellNav(user({ roleCode: 'admin' }), { isAdminPath: false });
    const hrefs = items.map((item) => item.href);

    expect(hrefs).toEqual(['/change-password']);
    expect(hrefs.some((href) => href.startsWith('/admin'))).toBe(false);
  });

  test('shows admin login only inside admin URLs', () => {
    const items = buildShellNav(null, { isAdminPath: true });

    expect(items.map((item) => item.href)).toEqual(['/admin/login']);
  });

  test('shows practice entries for student users without admin links', () => {
    const items = buildShellNav(user({ roleCode: 'student_strict' }), { isAdminPath: false });
    const hrefs = items.map((item) => item.href);

    expect(hrefs).toContain('/exam');
    expect(hrefs).toContain('/exam/wrong');
    expect(hrefs).toContain('/exam/history');
    expect(hrefs).toContain('/change-password');
    expect(hrefs).not.toContain('/admin');
    expect(hrefs).not.toContain('/admin/users');
  });

  test('filters operator entries by permission for non-super-admin roles', () => {
    const items = buildShellNav(
      user({
        roleCode: 'teacher',
        permissionCodes: ['question:read', 'stats:all'],
      }),
      { isAdminPath: true },
    );
    const hrefs = items.map((item) => item.href);

    expect(hrefs).toContain('/admin');
    expect(hrefs).toContain('/admin/questions');
    expect(hrefs).toContain('/admin/student-stats');
    expect(hrefs).toContain('/change-password');
    expect(hrefs).not.toContain('/admin/users');
    expect(hrefs).not.toContain('/admin/roles');
    expect(hrefs).not.toContain('/admin/login-logs');
  });

  test('shows all operator entries for super admin users', () => {
    const items = buildShellNav(user({ roleCode: 'super_admin' }), { isAdminPath: true });
    const hrefs = items.map((item) => item.href);

    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/admin',
        '/admin/questions',
        '/admin/student-stats',
        '/admin/login-logs',
        '/admin/users',
        '/admin/roles',
        '/change-password',
      ]),
    );
  });
});
