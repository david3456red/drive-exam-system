'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { CategoryFormSchema } from '@/lib/question-types';

export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

async function requirePerm(code: string) {
  const session = await auth();
  if (!hasPermission(session?.user, code)) return { ok: false as const, error: '无权限' };
  return { ok: true as const };
}

export async function createCategory(input: {
  bankId: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}): Promise<ActionResult> {
  const a = await requirePerm('category:create');
  if (!a.ok) return a;

  const parsed = CategoryFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '提交不合法' };

  const bank = await prisma.questionBank.findUnique({ where: { id: parsed.data.bankId } });
  if (!bank) return { ok: false, error: '题库不存在' };

  const collide = await prisma.category.findFirst({
    where: {
      bankId: parsed.data.bankId,
      parentId: parsed.data.parentId ?? null,
      name: parsed.data.name,
    },
  });
  if (collide) return { ok: false, error: `分类 "${parsed.data.name}" 已存在` };

  await prisma.category.create({
    data: {
      bankId: parsed.data.bankId,
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      sortOrder: parsed.data.sortOrder,
    },
  });
  revalidatePath(`/admin/banks/${parsed.data.bankId}`);
  return { ok: true };
}

export async function updateCategory(input: {
  id: string;
  name: string;
  sortOrder?: number;
}): Promise<ActionResult> {
  const a = await requirePerm('category:update');
  if (!a.ok) return a;

  const cat = await prisma.category.findUnique({ where: { id: input.id } });
  if (!cat) return { ok: false, error: '分类不存在' };

  const name = String(input.name ?? '').trim();
  if (!name) return { ok: false, error: '名称不能为空' };
  if (name.length > 60) return { ok: false, error: '名称过长' };

  if (name !== cat.name) {
    const collide = await prisma.category.findFirst({
      where: {
        bankId: cat.bankId,
        parentId: cat.parentId,
        name,
        NOT: { id: input.id },
      },
    });
    if (collide) return { ok: false, error: `同级已存在分类 "${name}"` };
  }

  await prisma.category.update({
    where: { id: input.id },
    data: {
      name,
      sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : cat.sortOrder,
    },
  });
  revalidatePath(`/admin/banks/${cat.bankId}`);
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const a = await requirePerm('category:delete');
  if (!a.ok) return a;

  const cat = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: { select: { questions: true, children: true } },
    },
  });
  if (!cat) return { ok: false, error: '分类不存在' };
  if (cat._count.children > 0) {
    return { ok: false, error: '请先删除子分类' };
  }
  // We allow deleting a category that's still attached to questions; the
  // QuestionCategory rows are removed by ON DELETE CASCADE. The questions
  // themselves stay.
  await prisma.category.delete({ where: { id } });
  revalidatePath(`/admin/banks/${cat.bankId}`);
  return { ok: true };
}
