import Link from 'next/link';
import { ArrowLeft, Edit3, LockKeyhole, UserCog } from 'lucide-react';

import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/server-session';

type RolesPageProps = {
  searchParams?: { error?: string; notice?: string };
};

export default async function RolesPage({ searchParams }: RolesPageProps) {
  const user = requireUser('role:read');
  const roles = await prisma.role.findMany({
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { users: true, permissions: true } },
    },
  });
  const canEdit = user.roleCode === 'super_admin';

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin">
          <ArrowLeft size={17} aria-hidden="true" />
          返回后台
        </Link>
        <h1>角色权限</h1>
        <p>权限变更会在用户下次登录时生效。超级管理员角色不可编辑。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}
      {searchParams?.notice ? <div className="notice">{searchParams.notice}</div> : null}
      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>角色</th>
              <th>编码</th>
              <th>严格登录</th>
              <th>用户数</th>
              <th>权限点</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td>{role.name}</td>
                <td>{role.code}</td>
                <td>{role.strictLogin ? '开启' : '关闭'}</td>
                <td>{role._count.users}</td>
                <td>{role._count.permissions}</td>
                <td>
                  {canEdit && role.code !== 'super_admin' ? (
                    <Link className="button primary" href={`/admin/roles/${role.id}/edit`}>
                      <Edit3 size={16} aria-hidden="true" />
                      编辑权限
                    </Link>
                  ) : (
                    <span className="badge">
                      {role.code === 'super_admin' ? (
                        <LockKeyhole size={15} aria-hidden="true" />
                      ) : (
                        <UserCog size={15} aria-hidden="true" />
                      )}
                      只读
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
