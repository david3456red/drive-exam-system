'use server';

import * as bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { loginPipeline } from '@/lib/auth-pipeline';
import { prisma } from '@/lib/db';
import {
  clearSessionCookie,
  getCurrentUser,
  requireUser,
  writeSessionCookie,
} from '@/lib/server-session';
import type { SessionUser } from '@/lib/session';
import { homeForRole } from '@/lib/session-shared';

function requestIp(): string {
  const h = headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip') || '127.0.0.1';
}

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  const deviceId = String(formData.get('deviceId') ?? '');

  const user = await loginPipeline({
    username,
    password,
    deviceId,
    ip: requestIp(),
    userAgent: headers().get('user-agent'),
  });

  if (!user) {
    redirect(`/login?error=${encodeURIComponent('用户名或密码错误，或账号状态不可用')}`);
  }

  const sessionUser: SessionUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    roleCode: user.roleCode,
    permissionCodes: user.permissionCodes,
  };
  writeSessionCookie(sessionUser);
  redirect(homeForRole(sessionUser.roleCode));
}

export async function logoutAction(): Promise<void> {
  clearSessionCookie();
  redirect('/');
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = requireUser();
  const oldPassword = String(formData.get('oldPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!oldPassword || !newPassword || newPassword !== confirmPassword) {
    redirect('/change-password?error=请检查旧密码和两次新密码');
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) redirect('/login');

  const ok = await bcrypt.compare(oldPassword, dbUser.passwordHash);
  if (!ok) redirect('/change-password?error=旧密码错误');

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });

  clearSessionCookie();
  redirect('/login?notice=密码已修改，请重新登录');
}

export async function redirectAfterLogin(): Promise<void> {
  const user = getCurrentUser();
  if (user) redirect(homeForRole(user.roleCode));
}
