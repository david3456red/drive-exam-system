import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Edge-safe middleware: only uses authConfig (no Prisma).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Match everything except API routes, Next internals, static files, and
  // the favicon. Auth.js will apply `authorized` callback from `authConfig`.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

export default middleware;
