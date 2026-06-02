'use server';

import * as bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  buildStatusUpdateData,
  canAssignRole,
  canManageUserRole,
} from '@/lib/admin-user-policy';
import { prisma } from '@/lib/db';
import { QUESTION_TYPES, USER_STATUSES, type QuestionType, type UserStatus } from '@/lib/enums';
import {
  QuestionImageInputError,
  QuestionImageUploadError,
  resolveQuestionImageFromFormData,
} from '@/lib/question-images';
import { JUDGE_OPTIONS, validateQuestionPayload } from '@/lib/question-validate';
import { requireUser } from '@/lib/server-session';

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export async function createBankAction(formData: FormData): Promise<void> {
  requireUser('bank:write');
  const code = text(formData, 'code');
  const name = text(formData, 'name');
  if (!code || !name) redirect('/admin/banks?error=请填写题库编码和名称');

  await prisma.questionBank.upsert({
    where: { code },
    update: { name },
    create: { code, name, isBuiltin: false },
  });
  revalidatePath('/admin/banks');
  revalidatePath('/exam');
  redirect('/admin/banks?notice=题库已保存');
}

export async function deleteBankAction(formData: FormData): Promise<void> {
  requireUser('bank:delete');
  const id = text(formData, 'id');
  const bank = await prisma.questionBank.findUnique({
    where: { id },
    include: { _count: { select: { questions: true } } },
  });
  if (!bank) redirect('/admin/banks?error=题库不存在');
  if (bank.isBuiltin) redirect('/admin/banks?error=内置题库不可删除');
  if (bank._count.questions > 0) {
    redirect('/admin/banks?error=题库下尚有题目，无法删除');
  }

  await prisma.questionBank.delete({ where: { id } });
  revalidatePath('/admin/banks');
  redirect('/admin/banks?notice=题库已删除');
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  requireUser('category:write');
  const name = text(formData, 'name');
  const parentId = nullableText(formData, 'parentId');
  if (!name) redirect('/admin/categories?error=请填写分类名称');

  try {
    const existing = await prisma.category.findFirst({ where: { name, parentId } });
    if (existing) redirect('/admin/categories?error=同级分类名重复');
    await prisma.category.create({ data: { name, parentId } });
  } catch {
    redirect('/admin/categories?error=同级分类名重复');
  }
  revalidatePath('/admin/categories');
  revalidatePath('/exam');
  redirect('/admin/categories?notice=分类已创建');
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  requireUser('category:delete');
  const id = text(formData, 'id');
  const childCount = await prisma.category.count({ where: { parentId: id } });
  if (childCount > 0) redirect('/admin/categories?error=请先删除子分类');

  await prisma.$transaction([
    prisma.questionCategory.deleteMany({ where: { categoryId: id } }),
    prisma.category.delete({ where: { id } }),
  ]);
  revalidatePath('/admin/categories');
  redirect('/admin/categories?notice=分类已删除');
}

export async function createQuestionAction(formData: FormData): Promise<void> {
  requireUser('question:write');
  const bankId = text(formData, 'bankId');
  const type = readQuestionType(text(formData, 'type'));
  const content = text(formData, 'content');
  const answer = text(formData, 'answer').toUpperCase();
  if (!bankId || !type || !content || !answer) {
    redirect('/admin/questions/new?error=请填写题库、题型、题干和答案');
  }

  const options =
    type === 'JUDGE'
      ? [...JUDGE_OPTIONS]
      : OPTION_KEYS.map((key) => ({ key, text: text(formData, `option${key}`) })).filter(
          (option) => option.text.length > 0,
        );
  const payload = {
    type,
    content,
    imageUrl: null,
    options,
    answer,
    explanation: nullableText(formData, 'explanation'),
    tags: splitList(text(formData, 'tags')),
  };
  const validation = validateQuestionPayload(payload);
  if (!validation.ok) {
    redirect(`/admin/questions/new?error=${encodeURIComponent(validation.errors.join('、'))}`);
  }

  let imageUrl: string | null;
  try {
    imageUrl = await resolveQuestionImageFromFormData(formData);
  } catch (error) {
    redirect(`/admin/questions/new?error=${encodeURIComponent(questionImageErrorMessage(error))}`);
  }

  const categoryIds = unique(formData.getAll('categoryIds').map(String).filter(Boolean));
  const question = await prisma.question.create({
    data: {
      bankId,
      type,
      content,
      imageUrl,
      options: JSON.stringify(options),
      answer,
      explanation: payload.explanation,
      tags: JSON.stringify(payload.tags),
    },
    select: { id: true },
  });

  if (categoryIds.length > 0) {
    await prisma.questionCategory.createMany({
      data: categoryIds.map((categoryId) => ({
        questionId: question.id,
        categoryId,
      })),
    });
  }

  revalidatePath('/admin/questions');
  revalidatePath('/exam');
  redirect(`/admin/questions/${question.id}?notice=题目已创建`);
}

export async function deleteQuestionAction(formData: FormData): Promise<void> {
  requireUser('question:delete');
  const id = text(formData, 'id');
  const usageCount =
    (await prisma.examRecord.count({ where: { questionId: id } })) +
    (await prisma.wrongQuestion.count({ where: { questionId: id } }));
  if (usageCount > 0) redirect(`/admin/questions/${id}?error=已有作答或错题记录，不能删除`);
  await prisma.questionCategory.deleteMany({ where: { questionId: id } });
  await prisma.question.delete({ where: { id } });
  revalidatePath('/admin/questions');
  redirect('/admin/questions?notice=题目已删除');
}

export async function updateRolePermissionsAction(formData: FormData): Promise<void> {
  const user = requireUser('role:edit-permissions');
  if (user.roleCode !== 'super_admin') redirect('/admin/roles?error=只有超级管理员可编辑权限');

  const roleId = text(formData, 'roleId');
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role || role.code === 'super_admin') redirect('/admin/roles?error=该角色不可编辑');

  const permissionIds = unique(formData.getAll('permissionIds').map(String).filter(Boolean));
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    ...(permissionIds.length > 0
      ? [
          prisma.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          }),
        ]
      : []),
  ]);
  revalidatePath('/admin/roles');
  redirect('/admin/roles?notice=权限已保存，用户下次登录后生效');
}

export async function createUserAction(formData: FormData): Promise<void> {
  const actor = requireUser('user:write');
  const username = text(formData, 'username');
  const name = nullableText(formData, 'name');
  const roleId = text(formData, 'roleId');
  const password = text(formData, 'password') || 'User@123456';
  if (!username || !roleId) redirect('/admin/users?error=请填写用户名和角色');

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { code: true },
  });
  if (!role) redirect('/admin/users?error=角色无效');
  if (!canAssignRole({ actorRoleCode: actor.roleCode, targetRoleCode: role.code })) {
    redirect('/admin/users?error=只有超级管理员可创建超级管理员账号');
  }

  try {
    await prisma.user.create({
      data: {
        username,
        name,
        roleId,
        passwordHash: await bcrypt.hash(password, 10),
        status: 'ACTIVE',
      },
    });
  } catch {
    redirect('/admin/users?error=用户名已存在或角色无效');
  }

  revalidatePath('/admin/users');
  redirect('/admin/users?notice=用户已创建，默认密码已写入');
}

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const actor = requireUser('user:unfreeze');
  const id = text(formData, 'id');
  const status = readUserStatus(text(formData, 'status'));
  if (!status) redirect('/admin/users?error=状态不合法');

  const target = await prisma.user.findUnique({
    where: { id },
    include: { role: { select: { code: true } } },
  });
  if (!target) redirect('/admin/users?error=用户不存在');
  if (!canManageUserRole({ actorRoleCode: actor.roleCode, targetRoleCode: target.role.code })) {
    redirect('/admin/users?error=只有超级管理员可管理超级管理员账号');
  }

  await prisma.user.update({
    where: { id },
    data: buildStatusUpdateData(target.status, status),
  });
  revalidatePath('/admin/users');
  redirect('/admin/users?notice=用户状态已更新');
}

export async function resetUserPasswordAction(formData: FormData): Promise<void> {
  const actor = requireUser('user:reset-password');
  const id = text(formData, 'id');
  const password = text(formData, 'password') || 'User@123456';
  const target = await prisma.user.findUnique({
    where: { id },
    include: { role: { select: { code: true } } },
  });
  if (!target) redirect('/admin/users?error=用户不存在');
  if (!canManageUserRole({ actorRoleCode: actor.roleCode, targetRoleCode: target.role.code })) {
    redirect('/admin/users?error=只有超级管理员可管理超级管理员账号');
  }
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  revalidatePath('/admin/users');
  redirect('/admin/users?notice=密码已重置');
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function nullableText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function splitList(value: string): string[] {
  return unique(
    value
      .split(/[|,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function readQuestionType(value: string): QuestionType | null {
  return QUESTION_TYPES.includes(value as QuestionType) ? (value as QuestionType) : null;
}

function readUserStatus(value: string): UserStatus | null {
  return USER_STATUSES.includes(value as UserStatus) ? (value as UserStatus) : null;
}

function questionImageErrorMessage(error: unknown): string {
  if (error instanceof QuestionImageInputError) {
    return '图片 URL 和上传图片只能选择一个';
  }
  if (error instanceof QuestionImageUploadError) {
    if (error.code === 'IMAGE_FILE_TYPE_INVALID') return '图片格式不支持，请上传 JPG、PNG、WebP 或 GIF';
    if (error.code === 'IMAGE_FILE_TOO_LARGE') return '单张图片不能超过 5MB';
  }
  throw error;
}
