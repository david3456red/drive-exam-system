/**
 * Edge-safe Auth.js configuration. Used by the Next.js middleware which
 * runs on the Edge Runtime (no Prisma, no bcrypt).
 *
 * Route groups (enforced here via `authorized()`):
 *
 *   public    /, /login, /admin/login, /api/*, static assets
 *   student   /exam/*, /profile      (requires login; admins also allowed)
 *   admin     /admin/* (except /admin/login)  (requires backend role)
 *
 * The full Credentials authorize() lives in `src/auth.ts`.
 */
import type { NextAuthConfig } from 'next-auth';
import { isBackendRole, isFrontendRole } from './lib/role-checks';

const PUBLIC_PATHS = new Set<string>(['/', '/login', '/admin/login']);

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isAdminLoginPath(pathname: string): boolean {
  return pathname === '/admin/login';
}

export const authConfig = {
  pages: {
    // Default sign-in page. The student-facing portal uses this; the admin
    // portal uses `/admin/login` and we route to it manually below.
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.roleName;
      const { pathname, search } = request.nextUrl;

      // ---- Public paths ----------------------------------------------------
      if (PUBLIC_PATHS.has(pathname)) {
        // Already-logged-in users hitting a login page: bounce to their home.
        if (isLoggedIn && (pathname === '/login' || pathname === '/admin/login')) {
          const home = isBackendRole(role) ? '/admin' : '/exam';
          return Response.redirect(new URL(home, request.nextUrl));
        }
        // `/` is a public landing, accessible to everyone (logged in or not).
        return true;
      }

      // ---- Protected paths -------------------------------------------------
      if (!isLoggedIn) {
        // Send to the appropriate login page with a callback.
        const target = isAdminPath(pathname) ? '/admin/login' : '/login';
        const callbackUrl = pathname + (search || '');
        const url = new URL(target, request.nextUrl);
        url.searchParams.set('callbackUrl', callbackUrl);
        return Response.redirect(url);
      }

      // Logged in — enforce role / portal alignment.
      if (isAdminPath(pathname) && !isAdminLoginPath(pathname)) {
        if (!isBackendRole(role)) {
          // Students must not see /admin pages.
          return Response.redirect(new URL('/exam', request.nextUrl));
        }
      } else {
        // Student-area or shared protected pages.
        // Admins may visit (e.g. preview); only block if explicitly student-only.
        // For now we allow all logged-in users. If we later want to redirect
        // admins away from /exam to /admin, do it here:
        //   if (isBackendRole(role)) return Response.redirect(new URL('/admin', ...));
        // We intentionally do NOT, so admins can preview the student portal.
        void isFrontendRole;
      }

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
