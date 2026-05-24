'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import {
  QuestionFormSchema,
  serializeOptions,
  serializeTags,
  type QuestionFormInput,
} from '@/lib/question-types';

export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

async function requirePerm(code: string) {
  const session = await auth();
  if (!hasPermission(session?.user, code)) return { ok: false as const, error: '无权限' };
  return { ok: true as const };
}

export async function createQuestion(input: QuestionFormInput): Promise<ActionResult<{ id: string }>> {
  const a = await requirePerm('question:create');
  if (!a.ok) return a;

  const parsed = QuestionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '提交不合法' };
  }
  const data = parsed.data;

  const bank = await prisma.questionBank.findUnique({ where: { id: data.bankId } });
  if (!bank) return { ok: false, error: '题库不存在' };

  // Validate categoryIds belong to this bank.
  if (data.categoryIds.length > 0) {
    const cats = await prisma.category.findMany({
      where: { id: { in: data.categoryIds }, bankId: data.bankId },
      select: { id: true },
    });
    const valid = new Set(cats.map((c) => c.id));
    const invalid = data.categoryIds.filter((id) => !valid.has(id));
    if (invalid.length > 0) {
      return { ok: false, error: `分类不属于当前题库:${invalid.join(', ')}` };
    }
  }

  const question = await prisma.question.create({
    data: {
      bankId: data.bankId,
      type: data.type,
      content: data.content,
      imageUrl: data.imageUrl ?? null,
      options: serializeOptions(data.options),
      answer: data.answer.toUpperCase(),
      explanation: data.explanation ?? null,
      tags: serializeTags(data.tags),
      categories: {
        create: data.categoryIds.map((categoryId) => ({ categoryId })),
      },
    },
  });

  revalidatePath('/admin/questions');
  return { ok: true, data: { id: question.id } };
}

export async function updateQuestion(
  id: string,
  input: QuestionFormInput,
): Promise<ActionResult> {
  const a = await requirePerm('question:update');
  if (!a.ok) return a;

  const parsed = QuestionFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '提交不合法' };
  }
  const data = parsed.data;

  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: '题目不存在' };

  // Validate categoryIds belong to selected bank
  if (data.categoryIds.length > 0) {
    const cats = await prisma.category.findMany({
      where: { id: { in: data.categoryIds }, bankId: data.bankId },
      select: { id: true },
    });
    const valid = new Set(cats.map((c) => c.id));
    const invalid = data.categoryIds.filter((id) => !valid.has(id));
    if (invalid.length > 0) {
      return { ok: false, error: `分类不属于当前题库:${invalid.join(', ')}` };
    }
  }

  await prisma.$transaction([
    prisma.questionCategory.deleteMany({ where: { questionId: id } }),
    prisma.question.update({
      where: { id },
      data: {
        bankId: data.bankId,
        type: data.type,
        content: data.content,
        imageUrl: data.imageUrl ?? null,
        options: serializeOptions(data.options),
        answer: data.answer.toUpperCase(),
        explanation: data.explanation ?? null,
        tags: serializeTags(data.tags),
        categories: {
          create: data.categoryIds.map((categoryId) => ({ categoryId })),
        },
      },
    }),
  ]);

  revalidatePath('/admin/questions');
  revalidatePath(`/admin/questions/${id}`);
  return { ok: true };
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const a = await requirePerm('question:delete');
  if (!a.ok) return a;
  const exists = await prisma.question.findUnique({ where: { id } });
  if (!exists) return { ok: false, error: '题目不存在' };
  await prisma.question.delete({ where: { id } });
  revalidatePath('/admin/questions');
  return { ok: true };
}

/** Fetch categories for the dynamic category-picker on the question form. */
export async function listCategoriesByBank(bankId: string) {
  if (!bankId) return [] as { id: string; name: string }[];
  return prisma.category.findMany({
    where: { bankId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
}
