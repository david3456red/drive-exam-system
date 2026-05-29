import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, UsersRound } from 'lucide-react';

import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/display';
import { listStudents } from '@/lib/exam-engine/queries';
import { requireUser } from '@/lib/server-session';

type StudentStatsPageProps = {
  searchParams?: { page?: string };
};

export default async function StudentStatsPage({ searchParams }: StudentStatsPageProps) {
  requireUser('stats:all');
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const students = await listStudents(prisma, { page, pageSize: 20 });
  const totalPages = Math.max(1, Math.ceil(students.total / students.pageSize));

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin">
          <ArrowLeft size={17} aria-hidden="true" />
          返回后台
        </Link>
        <h1>学员统计</h1>
        <p>按学员查看练习次数、最近练习时间和历史详情。</p>
      </div>
      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>学员</th>
              <th>账号</th>
              <th>练习次数</th>
              <th>最近练习</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {students.items.map((student) => (
              <tr key={student.id}>
                <td>{student.name || '-'}</td>
                <td>{student.username}</td>
                <td>{student.totalAttempts}</td>
                <td>{formatDateTime(student.lastPracticedAt)}</td>
                <td>
                  <Link className="button" href={`/admin/student-stats/${student.id}`}>
                    <Eye size={16} aria-hidden="true" />
                    详情
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {students.items.length === 0 ? (
          <div className="empty">
            <UsersRound size={18} aria-hidden="true" />
            暂无数据
          </div>
        ) : null}
      </section>
      <div className="cluster">
        <span className="muted">
          第 {page} / {totalPages} 页，共 {students.total} 名学员
        </span>
        {page > 1 ? (
          <Link className="button" href={`/admin/student-stats?page=${page - 1}`}>
            <ChevronLeft size={16} aria-hidden="true" />
            上一页
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link className="button" href={`/admin/student-stats?page=${page + 1}`}>
            下一页
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </main>
  );
}
