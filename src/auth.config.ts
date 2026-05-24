/**
 * Edge-safe Auth.js configuration. Used by the Next.js middleware which
 * runs on the Edge Runtime (no Prisma, no bcrypt).
 *
 * IMPORTANT: the `jwt` and `session` callbacks live here (not in auth.ts)
 * because the middleware ONLY reads `authConfig`. If we put them in auth.ts
 * the middleware would not project our custom fields (roleName, permissions)
 * onto `auth.user`, and role-based redirects in `authorized()` would fail.
 *
 * Route groups enforced via `authorized()`:
 *
 *   public    /, /login, /admin/login, /api/*, static assets
 *   student   /exam/*           (requires login; admins can preview)
 *   admin     /admin/*          (requires backend role)
 *
 * The full Credentials authorize() lives in `src/auth.ts`.
 */
import type { NextAuthConfig } from 'next-auth';
import { isBackendRole } from './lib/role-checks';

const PUBLIC_PATHS = new Set<string>(['/', '/login', '/admin/login']);

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isAdminLoginPath(pathname: string): boolean {
  return pathname === '/admin/login';
}

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    // ---- JWT lifecycle ---------------------------------------------------
    // Called on every JWT read/write. We populate custom fields on first
    // sign-in (when `user` is present) and pass them through subsequent reads.
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as unknown as {
          id: string;
          username: string;
          name: string | null;
          roleName: string;
          permissions: string[];
          mustChangePassword: boolean;
        };
        token.id = u.id;
        token.username = u.username;
        token.name = u.name;
        token.roleName = u.roleName;
        token.permissions = u.permissions;
        token.mustChangePassword = u.mustChangePassword;
      }

      // Allow client to update mustChangePassword via session.update()
      if (trigger === 'update' && session) {
        if (typeof session.mustChangePassword === 'boolean') {
          token.mustChangePassword = session.mustChangePassword;
        }
      }

      return token;
    },

    // ---- Session projection ---------------------------------------------
    // Project token fields onto `session.user`. This runs in BOTH the
    // middleware (edge) and the full Node.js runtime, which is critical for
    // role-based redirects below to see the correct `auth.user.roleName`.
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.name = (token.name as string | null) ?? null;
        session.user.roleName = token.roleName as string;
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },

    // ---- Per-request route gating ---------------------------------------
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.roleName;
      const { pathname, search } = request.nextUrl;

      // ---- Public paths ------------------------------------------------
      if (PUBLIC_PATHS.has(pathname)) {
        // Already-logged-in users hitting a login page: bounce to their home.
        if (isLoggedIn && (pathname === '/login' || pathname === '/admin/login')) {
          const home = isBackendRole(role) ? '/admin' : '/exam';
          return Response.redirect(new URL(home, request.nextUrl));
        }
        // `/` is a public landing, accessible to everyone (logged in or not).
        return true;
      }

      // ---- Protected paths ---------------------------------------------
      if (!isLoggedIn) {
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
      }
      // For non-admin paths, allow all logged-in users (admins can preview).

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
