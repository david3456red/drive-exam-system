/**
 * Shared session user shape used in JWT, server components and Auth.js callbacks.
 * Kept in a separate file so it can be imported from edge-runtime contexts
 * (middleware) without pulling in Prisma.
 */
export type SessionUser = {
  id: string;
  username: string;
  name: string | null;
  roleName: string;
  permissions: string[];
  mustChangePassword: boolean;
};

export const FREEZE_REASONS = {
  REMOTE_LOGIN: 'frozen_remote_login',
  ACCOUNT_DISABLED: 'account_disabled',
  ACCOUNT_FROZEN: 'account_frozen',
  WRONG_PASSWORD: 'wrong_password',
  USER_NOT_FOUND: 'user_not_found',
  MISSING_DEVICE_ID: 'missing_device_id',
} as const;
