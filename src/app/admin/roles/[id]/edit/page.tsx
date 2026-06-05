import Link from 'next/link';
import { ArrowLeft, Save, UserCog } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

import { updateRolePermissionsAction } from '@/app/admin/actions';
import { prisma } from '@/lib/db';
import { redirectMessagePath } from '@/lib/redirect-message';
import { requireUser } from '@/lib/server-session';

type EditRolePageProps = {
  params: { id: string };
};

export default async function EditRolePage({ params }: EditRolePageProps) {
  const user = requireUser('role:edit-permissions');
  if (user.roleCode !== 'super_admin') redirect(redirectMessagePath('/admin/roles', 'error', '只有超级管理员可编辑权限'));

  const [role, permissions] = await Promise.all([
    prisma.role.findUnique({
      where: { id: params.id },
      include: { permissions: true },
    }),
    prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { code: 'asc' }] }),
  ]);
  if (!role) notFound();
  if (role.code === 'super_admin') redirect(redirectMessagePath('/admin/roles', 'error', '超级管理员角色不可编辑'));

  const selected = new Set(role.permissions.map((item) => item.permissionId));
  const groups = groupPermissions(permissions);

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin/roles">
          <ArrowLeft size={17} aria-hidden="true" />
          返回角色
        </Link>
        <h1>编辑 {role.name}</h1>
        <p>变更将在用户下次登录时生效。</p>
      </div>

      <form action={updateRolePermissionsAction} className="panel stack">
        <input type="hidden" name="roleId" value={role.id} />
        {groups.map(([group, items]) => (
          <section className="stack" key={group}>
            <h2>
              <UserCog size={18} aria-hidden="true" />
              {group}
            </h2>
            <div className="grid">
              {items.map((permission) => (
                <label className="option" key={permission.id}>
                  <input
                    defaultChecked={selected.has(permission.id)}
                    name="permissionIds"
                    type="checkbox"
                    value={permission.id}
                  />
                  <span>
                    <strong>{permission.name}</strong>
                    <br />
                    <span className="muted">{permission.code}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ))}
        <button className="primary" type="submit">
          <Save size={17} aria-hidden="true" />
          保存权限
        </button>
      </form>
    </main>
  );
}

function groupPermissions<T extends { group: string }>(items: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.group) ?? [];
    group.push(item);
    groups.set(item.group, group);
  }
  return Array.from(groups.entries());
}
