/**
 * Role classification utilities — pure (no DB), edge-runtime safe.
 *
 * - BACKEND_ROLES: roles that use the admin portal at `/admin/*`.
 * - FRONTEND_ROLES: roles that use the student portal at `/` and `/exam/*`.
 *
 * NOTE: this is intentionally a code-level static set. The set of *roles* is
 * extensible in the DB (super_admin can create custom roles), but each new
 * role must be classified as either backend or frontend at creation time.
 * For built-in roles the classification is fixed.
 */

export const BACKEND_ROLES = new Set<string>(['super_admin', 'admin', 'teacher']);
export const FRONTEND_ROLES = new Set<string>(['student_strict', 'student_normal']);

export function isBackendRole(role?: string | null): boolean {
  return !!role && BACKEND_ROLES.has(role);
}

export function isFrontendRole(role?: string | null): boolean {
  return !!role && FRONTEND_ROLES.has(role);
}

/** Where to send a logged-in user when they have nowhere specific to go. */
export function homePathFor(role?: string | null): string {
  if (isBackendRole(role)) return '/admin';
  if (isFrontendRole(role)) return '/exam';
  return '/';
}

/** Where to send a logged-out user trying to reach `pathname`. */
export function loginPathFor(pathname: string, callbackUrl?: string): string {
  const cb = callbackUrl ?? pathname;
  const target = pathname.startsWith('/admin') ? '/admin/login' : '/login';
  return `${target}?callbackUrl=${encodeURIComponent(cb)}`;
}
