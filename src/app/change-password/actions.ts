'use server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

const Schema = z
  .object({
    oldPassword: z.string().min(1, '请输入旧密码'),
    newPassword: z
      .string()
      .min(8, '新密码至少 8 位')
      .max(64, '新密码最长 64 位')
      .regex(/[A-Za-z]/, '新密码需包含字母')
      .regex(/\d/, '新密码需包含数字'),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    path: ['confirm'],
    message: '两次输入的新密码不一致',
  })
  .refine((d) => d.oldPassword !== d.newPassword, {
    path: ['newPassword'],
    message: '新密码不能与旧密码相同',
  });

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

export async function changePassword(input: {
  oldPassword: string;
  newPassword: string;
  confirm: string;
}): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: '未登录' };

  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '输入不合法' };
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { ok: false, error: '账号不存在' };

  const valid = await bcrypt.compare(parsed.data.oldPassword, user.passwordHash);
  if (!valid) return { ok: false, error: '旧密码错误' };

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, mustChangePassword: false },
  });

  return { ok: true };
}
