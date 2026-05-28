import { createHmac, timingSafeEqual } from 'node:crypto';

export { homeForRole, SESSION_COOKIE_NAME } from '@/lib/session-shared';

export type SessionUser = {
  id: string;
  username: string;
  name: string | null;
  roleCode: string;
  permissionCodes: string[];
};

type SessionPayload = {
  user: SessionUser;
  exp: number;
};

export function createSessionToken(
  user: SessionUser,
  secret: string,
  maxAgeSeconds: number,
): string {
  const payload: SessionPayload = {
    user,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(body, secret);
  return `${body}.${signature}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  secret: string,
): SessionUser | null {
  if (!token || !secret) return null;

  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;

  const expected = sign(body, secret);
  if (!safeEqual(signature, expected)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
  } catch {
    return null;
  }

  if (!payload.user || !Number.isFinite(payload.exp)) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload.user;
}

export function getSessionSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    'development-only-drive-exam-session-secret-change-me'
  );
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}
