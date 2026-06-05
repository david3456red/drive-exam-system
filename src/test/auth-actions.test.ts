import * as bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';

const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
);

const sessionMock = vi.hoisted(() => ({
  clearSessionCookie: vi.fn(),
  getCurrentUser: vi.fn(),
  requireUser: vi.fn(() => ({ id: 'user-1' })),
  writeSessionCookie: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}));

vi.mock('@/lib/server-session', () => sessionMock);

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

describe('auth actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('URL-encodes change password validation errors in redirects', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      passwordHash: 'hash',
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const { changePasswordAction } = await import('@/app/actions/auth');
    const formData = new FormData();
    formData.set('oldPassword', 'Wrong@123');
    formData.set('newPassword', 'Temp@1234');
    formData.set('confirmPassword', 'Temp@1234');

    await expect(changePasswordAction(formData)).rejects.toThrow(
      `REDIRECT:/change-password?error=${encodeURIComponent('旧密码错误')}`,
    );
  });
});
