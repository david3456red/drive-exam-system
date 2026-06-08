import { NextResponse, type NextRequest } from 'next/server';

import { isStaffRole, isStudentRole } from '@/lib/login-flow';
import { SESSION_COOKIE_NAME } from '@/lib/session-shared';

const PUBLIC_PATHS = ['/', '/login', '/admin/login'];
const STATIC_PREFIXES = ['/_next', '/favicon.ico', '/robots.txt'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const roleCode = readRoleFromToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!roleCode && !isPublic && !pathname.startsWith('/api/exam/abandon')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith('/admin') ? '/admin/login' : '/login';
    return NextResponse.redirect(url);
  }

  if (roleCode) {
    if (isStudentRole(roleCode) && pathname.startsWith('/admin')) {
      const url = request.nextUrl.clone();
      url.pathname = '/exam';
      return NextResponse.redirect(url);
    }
    if (
      pathname.startsWith('/admin/roles/') &&
      pathname.endsWith('/edit') &&
      roleCode !== 'super_admin'
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      return NextResponse.redirect(url);
    }
    if (isStaffRole(roleCode) && pathname.startsWith('/exam')) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

function readRoleFromToken(token: string | undefined): string | null {
  if (!token) return null;
  const [body] = token.split('.');
  if (!body) return null;
  try {
    const json = JSON.parse(base64UrlDecode(body)) as {
      user?: { roleCode?: unknown };
    };
    return typeof json.user?.roleCode === 'string' ? json.user.roleCode : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  return atob(padded);
}
