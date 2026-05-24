'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

const Schema = z.object({
  roleId: z.string().min(1),
  permissionIds: z.array(z.string()),
});

export type SaveRolePermissionsResult = { ok: true } | { ok: false; error: string };

/**
 * Replace the permission set of a role.
 *
 * Only `super_admin` users may invoke this. The `super_admin` role itself
 * cannot be edited (it always has every permission via the hasPermission()
 * shortcut). Built-in roles can be edited (their permissions, not their
 * builtin/strictLogin flags).
 */
export async function saveRolePermissions(input: {
  roleId: string;
  permissionIds: string[];
}): Promise<SaveRolePermissionsResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: '未登录' };
  if (session.user.roleName !== 'super_admin') {
    return { ok: false, error: '仅超级管理员可以编辑角色权限' };
  }

  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: '提交数据不合法' };

  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) return { ok: false, error: '角色不存在' };
  if (role.name === 'super_admin') {
    return { ok: false, error: '超级管理员的权限不可编辑' };
  }

  // Validate that every submitted permission ID actually exists.
  const validPerms = await prisma.permission.findMany({
    where: { id: { in: parsed.data.permissionIds } },
    select: { id: true },
  });
  const validIds = new Set(validPerms.map((p) => p.id));
  const cleanIds = parsed.data.permissionIds.filter((id) => validIds.has(id));

  // Replace role-permission rows in a transaction.
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
    prisma.rolePermission.createMany({
      data: cleanIds.map((permissionId) => ({ roleId: role.id, permissionId })),
    }),
  ]);

  revalidatePath('/admin/roles');
  revalidatePath(`/admin/roles/${role.id}/edit`);
  return { ok: true };
}
