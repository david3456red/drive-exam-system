import type { Prisma } from '@prisma/client';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { prisma } from '@/lib/db';
import { formatDeviceDisplay } from '@/lib/device-display';
import { formatDateTime } from '@/lib/display';
import { requireUser } from '@/lib/server-session';

type LogsPageProps = {
  searchParams?: { q?: string; success?: string; page?: string };
};

export default async function LoginLogsPage({ searchParams }: LogsPageProps) {
  requireUser('log:read');
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const q = (searchParams?.q ?? '').trim();
  const success = searchParams?.success;
  const where: Prisma.LoginLogWhereInput = {
    ...(success === 'true' ? { success: true } : success === 'false' ? { success: false } : {}),
    ...(q
      ? {
          OR: [
            { username: { contains: q } },
            { ip: { contains: q } },
            { deviceId: { contains: q } },
            { userAgent: { contains: q } },
          ],
        }
      : {}),
  };
  const [logs, total] = await Promise.all([
    prisma.loginLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 30,
      take: 30,
    }),
    prisma.loginLog.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / 30));

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin">
          <ArrowLeft size={17} aria-hidden="true" />
          返回后台
        </Link>
        <h1>登录日志</h1>
        <p>审计登录成功、失败原因、IP 与设备指纹。</p>
      </div>
      <form className="panel grid">
        <div className="field">
          <label htmlFor="success">
            <ShieldCheck size={15} aria-hidden="true" />
            结果
          </label>
          <select id="success" name="success" defaultValue={success ?? ''}>
            <option value="">全部</option>
            <option value="true">成功</option>
            <option value="false">失败</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="q">
            <Search size={15} aria-hidden="true" />
            关键字
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="用户名 / IP / 设备" />
        </div>
        <button className="primary" type="submit">
          <Search size={17} aria-hidden="true" />
          筛选
        </button>
      </form>
      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>结果</th>
              <th>原因</th>
              <th>IP</th>
              <th>设备</th>
            </tr>
          </thead>
          <tbody>
          {logs.map((log) => {
            const device = formatDeviceDisplay({
              deviceId: log.deviceId,
              userAgent: log.userAgent,
            });

            return (
              <tr key={log.id}>
                <td>{formatDateTime(log.createdAt)}</td>
                <td>{log.username}</td>
                <td>
                  <span className={log.success ? 'badge good' : 'badge bad'}>
                    {log.success ? (
                      <CheckCircle2 size={15} aria-hidden="true" />
                    ) : (
                      <XCircle size={15} aria-hidden="true" />
                    )}
                    {log.success ? '成功' : '失败'}
                  </span>
                </td>
                <td>{log.reason}</td>
                <td>{log.ip}</td>
                <td className="device-cell">
                  <span>{device.label}</span>
                  <small>{device.shortId}</small>
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
        {logs.length === 0 ? <div className="empty">暂无日志</div> : null}
      </section>
      <div className="cluster">
        <span className="muted">
          第 {page} / {totalPages} 页，共 {total} 条
        </span>
        {page > 1 ? (
          <Link className="button" href={`/admin/login-logs?page=${page - 1}`}>
            <ChevronLeft size={16} aria-hidden="true" />
            上一页
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link className="button" href={`/admin/login-logs?page=${page + 1}`}>
            下一页
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </main>
  );
}
