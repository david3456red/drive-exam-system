/**
 * Permission helpers used in server components / actions / API routes.
 * The user's role + permission codes are stored in the JWT, so we don't
 * hit the DB on every check.
 */
import type { SessionUser } from './auth-types';

export function hasPermission(user: SessionUser | null | undefined, code: string): boolean {
  if (!user) return false;
  if (user.roleName === 'super_admin') return true;
  return user.permissions.includes(code);
}

export function hasAnyPermission(user: SessionUser | null | undefined, codes: string[]): boolean {
  return codes.some((c) => hasPermission(user, c));
}

/** Whether `actor` may create accounts with `targetRoleName`. */
export function canCreateRole(
  actor: SessionUser | null | undefined,
  targetRoleName: string,
): boolean {
  if (!actor) return false;
  if (actor.roleName === 'super_admin') return true;
  if (actor.roleName === 'admin') {
    // Admin cannot create super_admin or admin
    return ['teacher', 'student_strict', 'student_normal'].includes(targetRoleName);
  }
  return false;
}
