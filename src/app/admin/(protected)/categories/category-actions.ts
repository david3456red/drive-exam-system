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

/**
 * Application-level uniqueness check for the (parentId, name) pair.
 * SQLite's @@unique([parentId, name]) does NOT prevent duplicates when
 * `parentId IS NULL`, so we always check manually.
 */
async function ensureUnique(
  name: string,
  parentId: string | null,
  excludeId?: string,
): Promise<string | null> {
  const collide = await prisma.category.findFirst({
    where: {
      name,
      parentId,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (collide) {
    return parentId === null
      ? `顶层已存在分类 "${name}"`
      : `父分类下已存在 "${name}"`;
  }
  return null;
}

export async function createCategory(input: {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}): Promise<ActionResult> {
  const a = await requirePerm('category:create');
  if (!a.ok) return a;

  const parsed = CategoryFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '提交不合法' };

  const parentId = parsed.data.parentId ?? null;
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) return { ok: false, error: '父分类不存在' };
  }

  const dup = await ensureUnique(parsed.data.name, parentId);
  if (dup) return { ok: false, error: dup };

  await prisma.category.create({
    data: {
      name: parsed.data.name,
      parentId,
      sortOrder: parsed.data.sortOrder,
    },
  });
  revalidatePath('/admin/categories');
  return { ok: true };
}

export async function updateCategory(input: {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}): Promise<ActionResult> {
  const a = await requirePerm('category:update');
  if (!a.ok) return a;

  const cat = await prisma.category.findUnique({ where: { id: input.id } });
  if (!cat) return { ok: false, error: '分类不存在' };

  const name = String(input.name ?? '').trim();
  if (!name) return { ok: false, error: '名称不能为空' };
  if (name.length > 60) return { ok: false, error: '名称过长' };

  const parentId = input.parentId === undefined ? cat.parentId : (input.parentId ?? null);
  if (parentId === input.id) return { ok: false, error: '父分类不能选自己' };
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) return { ok: false, error: '父分类不存在' };
  }

  if (name !== cat.name || parentId !== cat.parentId) {
    const dup = await ensureUnique(name, parentId, input.id);
    if (dup) return { ok: false, error: dup };
  }

  await prisma.category.update({
    where: { id: input.id },
    data: {
      name,
      parentId,
      sortOrder:
        typeof input.sortOrder === 'number' ? input.sortOrder : cat.sortOrder,
    },
  });
  revalidatePath('/admin/categories');
  revalidatePath('/admin/banks');
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
  // QuestionCategory rows cascade away; the question records themselves
  // are not deleted.
  await prisma.category.delete({ where: { id } });
  revalidatePath('/admin/categories');
  revalidatePath('/admin/banks');
  return { ok: true };
}
