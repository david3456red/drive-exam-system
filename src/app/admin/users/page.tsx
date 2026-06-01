import Link from 'next/link';
import { ArrowLeft, KeyRound, Save, UserCog, UserRound, UsersRound } from 'lucide-react';

import { createUserAction, resetUserPasswordAction, setUserStatusAction } from '@/app/admin/actions';
import { canAssignRole, canManageUserRole } from '@/lib/admin-user-policy';
import { prisma } from '@/lib/db';
import { USER_STATUSES } from '@/lib/enums';
import { formatDateTime } from '@/lib/display';
import { requireUser } from '@/lib/server-session';

type UsersPageProps = {
  searchParams?: { error?: string; notice?: string };
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const currentUser = requireUser('user:read');
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { role: true },
      take: 100,
    }),
    prisma.role.findMany({ orderBy: { code: 'asc' } }),
  ]);
  const assignableRoles = roles.filter((role) =>
    canAssignRole({ actorRoleCode: currentUser.roleCode, targetRoleCode: role.code }),
  );

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin">
          <ArrowLeft size={17} aria-hidden="true" />
          返回后台
        </Link>
        <h1>用户管理</h1>
        <p>创建学员、教练和管理员账号；冻结状态会阻止继续登录。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}
      {searchParams?.notice ? <div className="notice">{searchParams.notice}</div> : null}

      <section className="panel stack">
        <h2>新建用户</h2>
        <form action={createUserAction} className="grid">
          <div className="field">
            <label htmlFor="username">
              <UserRound size={15} aria-hidden="true" />
              用户名
            </label>
            <input id="username" name="username" required />
          </div>
          <div className="field">
            <label htmlFor="name">
              <UsersRound size={15} aria-hidden="true" />
              姓名
            </label>
            <input id="name" name="name" />
          </div>
          <div className="field">
            <label htmlFor="roleId">
              <UserCog size={15} aria-hidden="true" />
              角色
            </label>
            <select id="roleId" name="roleId" required>
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="password">
              <KeyRound size={15} aria-hidden="true" />
              初始密码
            </label>
            <input id="password" name="password" placeholder="默认 User@123456" />
          </div>
          <button className="primary" type="submit">
            <Save size={17} aria-hidden="true" />
            创建用户
          </button>
        </form>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>角色</th>
              <th>状态</th>
              <th>最近登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.name || user.username}</strong>
                  <br />
                  <span className="muted">{user.username}</span>
                </td>
                <td>{user.role.name}</td>
                <td>{user.status}</td>
                <td>{user.lastLoginIp ?? '-'} · {formatDateTime(user.updatedAt)}</td>
                <td>
                  {canManageUserRole({
                    actorRoleCode: currentUser.roleCode,
                    targetRoleCode: user.role.code,
                  }) ? (
                    <div className="cluster">
                      <form action={setUserStatusAction} className="cluster">
                        <input type="hidden" name="id" value={user.id} />
                        <select name="status" defaultValue={user.status}>
                          {USER_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <button type="submit">
                          <Save size={16} aria-hidden="true" />
                          改状态
                        </button>
                      </form>
                      <form action={resetUserPasswordAction} className="cluster">
                        <input type="hidden" name="id" value={user.id} />
                        <input name="password" placeholder="新密码" />
                        <button type="submit">
                          <KeyRound size={16} aria-hidden="true" />
                          重置
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="badge">仅超级管理员可操作</span>
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
