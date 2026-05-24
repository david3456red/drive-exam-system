'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { BankFormSchema } from '@/lib/question-types';

export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

async function requirePerm(code: string) {
  const session = await auth();
  if (!hasPermission(session?.user, code)) {
    return { ok: false as const, error: '无权限' };
  }
  return { ok: true as const, user: session!.user };
}

export async function createBank(input: {
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<ActionResult> {
  const auth = await requirePerm('bank:create');
  if (!auth.ok) return auth;

  const parsed = BankFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '提交不合法' };

  const exists = await prisma.questionBank.findUnique({ where: { code: parsed.data.code } });
  if (exists) return { ok: false, error: `code "${parsed.data.code}" 已存在` };

  await prisma.questionBank.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
      isBuiltin: false,
    },
  });
  revalidatePath('/admin/banks');
  return { ok: true };
}

export async function updateBank(input: {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<ActionResult> {
  const auth = await requirePerm('bank:update');
  if (!auth.ok) return auth;

  const parsed = BankFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '提交不合法' };

  const bank = await prisma.questionBank.findUnique({ where: { id: input.id } });
  if (!bank) return { ok: false, error: '题库不存在' };

  // Built-in banks: don't allow code change to keep seed idempotency safe.
  if (bank.isBuiltin && bank.code !== parsed.data.code) {
    return { ok: false, error: '内置题库的 code 不可修改' };
  }

  // If code is changing, ensure no collision.
  if (bank.code !== parsed.data.code) {
    const collide = await prisma.questionBank.findUnique({ where: { code: parsed.data.code } });
    if (collide) return { ok: false, error: `code "${parsed.data.code}" 已存在` };
  }

  await prisma.questionBank.update({
    where: { id: input.id },
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
    },
  });
  revalidatePath('/admin/banks');
  revalidatePath(`/admin/banks/${input.id}`);
  return { ok: true };
}

export async function deleteBank(id: string): Promise<ActionResult> {
  const auth = await requirePerm('bank:delete');
  if (!auth.ok) return auth;

  const bank = await prisma.questionBank.findUnique({
    where: { id },
    include: { _count: { select: { questions: true } } },
  });
  if (!bank) return { ok: false, error: '题库不存在' };
  if (bank.isBuiltin) return { ok: false, error: '内置题库不可删除(可改为停用)' };
  if (bank._count.questions > 0) {
    return {
      ok: false,
      error: `题库下有 ${bank._count.questions} 道题,无法删除。请先转移或清空题目。`,
    };
  }

  await prisma.questionBank.delete({ where: { id } });
  revalidatePath('/admin/banks');
  return { ok: true };
}
