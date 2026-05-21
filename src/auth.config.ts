/**
 * Edge-safe Auth.js configuration. Used by the Next.js middleware which
 * runs on the Edge Runtime (no Prisma, no bcrypt).
 *
 * The full config (with Credentials provider that uses Prisma) lives in
 * `src/auth.ts`.
 */
import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  callbacks: {
    /**
     * Run on every request that goes through middleware.
     * Returning `true` allows the request, `false` redirects to the login page,
     * and a Response/NextResponse can be used to perform a custom redirect.
     */
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Public routes
      const publicPaths = ['/login'];
      const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

      if (isPublic) {
        // If already logged in and visiting /login, send to /dashboard
        if (isLoggedIn && pathname === '/login') {
          return Response.redirect(new URL('/dashboard', request.nextUrl));
        }
        return true;
      }

      // Everything else requires login
      if (!isLoggedIn) return false;

      // Force first-time password change
      const mustChange = (auth?.user as { mustChangePassword?: boolean } | undefined)?.mustChangePassword;
      if (mustChange && pathname !== '/change-password') {
        return Response.redirect(new URL('/change-password', request.nextUrl));
      }

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
