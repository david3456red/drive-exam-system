import Link from 'next/link';

import { prisma } from '@/lib/db';
import { EXAM_MODE_LABEL, EXAM_STATUS_LABEL, formatDateTime, formatDuration } from '@/lib/display';
import { listAttempts } from '@/lib/exam-engine/queries';
import { requireUser } from '@/lib/server-session';

type HistoryPageProps = {
  searchParams?: { page?: string };
};

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const user = requireUser('stats:self');
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const attempts = await listAttempts(prisma, { userId: user.id, page, pageSize: 20 });
  const totalPages = Math.max(1, Math.ceil(attempts.total / attempts.pageSize));

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/exam">
          返回练习
        </Link>
        <h1>答题记录</h1>
        <p>仅展示已完成或已放弃的会话，进行中的练习可在练习首页继续。</p>
      </div>
      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>模式</th>
              <th>题库</th>
              <th>状态</th>
              <th>成绩</th>
              <th>时间</th>
              <th>操作</th>
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
                <td>
                  {formatDateTime(attempt.startedAt)} · {formatDuration(attempt.durationMs)}
                </td>
                <td>
                  <Link className="button" href={`/exam/history/${attempt.id}`}>
                    详情
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {attempts.items.length === 0 ? <div className="empty">暂无答题记录</div> : null}
      </section>
      <div className="cluster">
        <span className="muted">
          第 {page} / {totalPages} 页，共 {attempts.total} 条
        </span>
        {page > 1 ? <Link className="button" href={`/exam/history?page=${page - 1}`}>上一页</Link> : null}
        {page < totalPages ? <Link className="button" href={`/exam/history?page=${page + 1}`}>下一页</Link> : null}
      </div>
    </main>
  );
}
