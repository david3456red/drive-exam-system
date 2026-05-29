import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, UsersRound } from 'lucide-react';
import { notFound } from 'next/navigation';

import { prisma } from '@/lib/db';
import { EXAM_MODE_LABEL, EXAM_STATUS_LABEL, formatDateTime, formatDuration } from '@/lib/display';
import { getStudentSummary, listAttempts } from '@/lib/exam-engine/queries';
import { requireUser } from '@/lib/server-session';

type StudentDetailPageProps = {
  params: { userId: string };
  searchParams?: { page?: string };
};

export default async function StudentDetailPage({ params, searchParams }: StudentDetailPageProps) {
  requireUser('stats:all');
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const [student, summary, attempts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      include: { role: true },
    }),
    getStudentSummary(prisma, params.userId),
    listAttempts(prisma, { userId: params.userId, page, pageSize: 20 }),
  ]);
  if (!student) notFound();
  const totalPages = Math.max(1, Math.ceil(attempts.total / attempts.pageSize));

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin/student-stats">
          <ArrowLeft size={17} aria-hidden="true" />
          返回学员统计
        </Link>
        <h1>{student.name || student.username}</h1>
        <p>{student.role.name} · 最近练习 {formatDateTime(summary.lastPracticedAt)}</p>
      </div>
      <section className="grid">
        <Metric title="练习次数" value={String(summary.totalAttempts)} />
        <Metric title="平均正确率" value={`${Math.round(summary.avgCorrectRate * 100)}%`} />
        <Metric title="账号状态" value={student.status} />
      </section>
      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>模式</th>
              <th>题库</th>
              <th>状态</th>
              <th>成绩</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {attempts.items.map((attempt) => (
              <tr key={attempt.id}>
                <td>{EXAM_MODE_LABEL[attempt.mode]}</td>
                <td>{attempt.bankName ?? '错题重做'}</td>
                <td>{EXAM_STATUS_LABEL[attempt.status]}</td>
                <td>
                  {attempt.correctCount ?? 0}/{attempt.totalCount ?? 0} · {attempt.score ?? 0} 分
                </td>
                <td>{formatDateTime(attempt.startedAt)} · {formatDuration(attempt.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {attempts.items.length === 0 ? (
          <div className="empty">
            <UsersRound size={18} aria-hidden="true" />
            暂无数据
          </div>
        ) : null}
      </section>
      <div className="cluster">
        <span className="muted">
          第 {page} / {totalPages} 页，共 {attempts.total} 条
        </span>
        {page > 1 ? (
          <Link className="button" href={`/admin/student-stats/${student.id}?page=${page - 1}`}>
            <ChevronLeft size={16} aria-hidden="true" />
            上一页
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link className="button" href={`/admin/student-stats/${student.id}?page=${page + 1}`}>
            下一页
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="card">
      <p className="muted">{title}</p>
      <strong style={{ fontSize: '1.8rem' }}>{value}</strong>
    </div>
  );
}
