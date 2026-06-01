import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { hasPermission, type PermissionCode } from '@/lib/permissions';
import {
  createSessionToken,
  getSessionSecret,
  verifySessionToken,
  type SessionUser,
} from '@/lib/session';
import { homeForRole, SESSION_COOKIE_NAME } from '@/lib/session-shared';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export function getCurrentUser(): SessionUser | null {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token, getSessionSecret());
}

export function requireUser(permission?: PermissionCode): SessionUser {
  const user = getCurrentUser();
  if (!user) redirect('/login');

  if (permission && !hasPermission({ user }, permission)) {
    redirect(homeForRole(user.roleCode));
  }

  return user;
}

export function writeSessionCookie(user: SessionUser): void {
  cookies().set({
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(user, getSessionSecret(), SESSION_MAX_AGE_SECONDS),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(): void {
  cookies().set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
