/**
 * Auth.js v5 main configuration.
 *
 * - Credentials provider: looks the user up via Prisma, verifies bcrypt
 *   password, enforces "异地登录冻结" (remote-login freeze) for roles whose
 *   `strictLogin = true`, and writes a `LoginLog` row for every attempt.
 * - JWT session: caches role + permission codes in the token so most
 *   permission checks don't hit the DB.
 */
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

import { authConfig } from './auth.config';
import { prisma } from './lib/db';
import { getClientIp } from './lib/get-client-ip';
import { FREEZE_REASONS } from './lib/auth-types';

// ---- Custom error codes surfaced to the UI ---------------------------------
export class InvalidCredentials extends CredentialsSignin {
  code = 'INVALID_CREDENTIALS';
}
export class AccountFrozen extends CredentialsSignin {
  code = 'ACCOUNT_FROZEN';
}
export class AccountDisabled extends CredentialsSignin {
  code = 'ACCOUNT_DISABLED';
}
export class FrozenRemoteLogin extends CredentialsSignin {
  code = 'FROZEN_REMOTE_LOGIN';
}
export class MissingDeviceId extends CredentialsSignin {
  code = 'MISSING_DEVICE_ID';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
        deviceId: { label: 'Device Id', type: 'text' },
      },
      async authorize(rawCredentials, request) {
        const username = String(rawCredentials?.username ?? '').trim();
        const password = String(rawCredentials?.password ?? '');
        const deviceId = String(rawCredentials?.deviceId ?? '').trim();

        if (!username || !password) throw new InvalidCredentials();
        if (!deviceId) throw new MissingDeviceId();

        const ip = getClientIp(request.headers);
        const userAgent = request.headers.get('user-agent') ?? null;

        const user = await prisma.user.findUnique({
          where: { username },
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        });

        // Unknown user: do not leak info.
        if (!user) {
          throw new InvalidCredentials();
        }

        // Disabled account: hard fail.
        if (user.status === 'DISABLED') {
          await prisma.loginLog.create({
            data: {
              userId: user.id,
              ip, deviceId, userAgent,
              success: false,
              reason: FREEZE_REASONS.ACCOUNT_DISABLED,
            },
          });
          throw new AccountDisabled();
        }

        // Frozen account: hard fail.
        if (user.status === 'FROZEN') {
          await prisma.loginLog.create({
            data: {
              userId: user.id,
              ip, deviceId, userAgent,
              success: false,
              reason: FREEZE_REASONS.ACCOUNT_FROZEN,
            },
          });
          throw new AccountFrozen();
        }

        // Password check.
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await prisma.loginLog.create({
            data: {
              userId: user.id,
              ip, deviceId, userAgent,
              success: false,
              reason: FREEZE_REASONS.WRONG_PASSWORD,
            },
          });
          throw new InvalidCredentials();
        }

        // Remote-login freeze for strict roles (e.g. student_strict).
        // Rule: if the role is strict AND there is a previous successful
        // login AND (ip changed OR device changed), freeze the account.
        if (user.role.strictLogin) {
          const lastSuccess = await prisma.loginLog.findFirst({
            where: { userId: user.id, success: true },
            orderBy: { createdAt: 'desc' },
          });
          if (lastSuccess && (lastSuccess.ip !== ip || lastSuccess.deviceId !== deviceId)) {
            await prisma.user.update({
              where: { id: user.id },
              data: { status: 'FROZEN' },
            });
            await prisma.loginLog.create({
              data: {
                userId: user.id,
                ip, deviceId, userAgent,
                success: false,
                reason: FREEZE_REASONS.REMOTE_LOGIN,
              },
            });
            throw new FrozenRemoteLogin();
          }
        }

        // Success: log it and project user info into the JWT.
        await prisma.loginLog.create({
          data: {
            userId: user.id,
            ip, deviceId, userAgent,
            success: true,
          },
        });

        const permissions = user.role.permissions.map((rp) => rp.permission.code);

        return {
          id: user.id,
          username: user.username,
          name: user.name ?? user.username,
          roleName: user.role.name,
          permissions,
          // Field is kept on the user record for analytics, but no longer
          // enforced anywhere (no forced redirect).
          mustChangePassword: false,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      // On initial sign-in, copy fields to the token.
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

      // Allow the client to push a session.update({ mustChangePassword: false })
      // after a successful password change.
      if (trigger === 'update' && session) {
        if (typeof session.mustChangePassword === 'boolean') {
          token.mustChangePassword = session.mustChangePassword;
        }
      }

      return token;
    },
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
  },
});
