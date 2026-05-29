import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Search,
  XCircle,
} from 'lucide-react';

import { toggleMasteredAction } from '@/app/exam/actions';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/display';
import { listWrongQuestions, type MasteredFilter } from '@/lib/exam-engine/queries';
import { requireUser } from '@/lib/server-session';

type WrongPageProps = {
  searchParams?: {
    page?: string;
    bankId?: string;
    masteredFilter?: string;
    error?: string;
  };
};

export default async function WrongPage({ searchParams }: WrongPageProps) {
  const user = requireUser('wrong:read');
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const masteredFilter = readMasteredFilter(searchParams?.masteredFilter ?? 'all');
  const bankId = searchParams?.bankId || undefined;
  const [banks, wrongs] = await Promise.all([
    prisma.questionBank.findMany({ orderBy: { createdAt: 'asc' } }),
    listWrongQuestions(prisma, {
      userId: user.id,
      page,
      pageSize: 20,
      bankId,
      masteredFilter,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(wrongs.total / wrongs.pageSize));

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/exam">
          <ArrowLeft size={17} aria-hidden="true" />
          返回练习
        </Link>
        <h1>错题本</h1>
        <p>错题答对三次会自动标记掌握，也可以在这里手动调整掌握状态。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}

      <form className="panel grid">
        <div className="field">
          <label htmlFor="bankId">
            <ClipboardList size={15} aria-hidden="true" />
            题库
          </label>
          <select id="bankId" name="bankId" defaultValue={bankId ?? ''}>
            <option value="">全部题库</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="masteredFilter">
            <CheckCircle2 size={15} aria-hidden="true" />
            掌握状态
          </label>
          <select id="masteredFilter" name="masteredFilter" defaultValue={masteredFilter}>
            <option value="all">全部</option>
            <option value="unmastered">未掌握</option>
            <option value="mastered">已掌握</option>
          </select>
        </div>
        <button className="primary" type="submit">
          <Search size={17} aria-hidden="true" />
          筛选
        </button>
      </form>

      <section className="stack">
        {wrongs.items.map((item) => (
          <article className="panel stack" key={item.id}>
            <div className="cluster">
              <span className={item.mastered ? 'badge good' : 'badge bad'}>
                {item.mastered ? (
                  <CheckCircle2 size={15} aria-hidden="true" />
                ) : (
                  <XCircle size={15} aria-hidden="true" />
                )}
                {item.mastered ? '已掌握' : '未掌握'}
              </span>
              <span className="badge">{item.bankName}</span>
              <span className="muted">最近答错 {formatDateTime(item.lastWrongAt)}</span>
            </div>
            <h2>{item.questionContent}</h2>
            <p className="muted">
              错误 {item.wrongCount} 次，连续答对 {item.rightCount} 次
            </p>
            <form action={toggleMasteredAction}>
              <input type="hidden" name="wrongId" value={item.id} />
              <input type="hidden" name="mastered" value={String(!item.mastered)} />
              <button className={item.mastered ? 'ghost' : 'primary'} type="submit">
                <CheckCircle2 size={16} aria-hidden="true" />
                {item.mastered ? '取消掌握' : '标记掌握'}
              </button>
            </form>
          </article>
        ))}
        {wrongs.items.length === 0 ? <div className="empty">暂无错题</div> : null}
      </section>

      <div className="cluster">
        <span className="muted">
          第 {page} / {totalPages} 页，共 {wrongs.total} 条
        </span>
        {page > 1 ? (
          <Link className="button" href={`/exam/wrong?page=${page - 1}`}>
            <ChevronLeft size={16} aria-hidden="true" />
            上一页
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link className="button" href={`/exam/wrong?page=${page + 1}`}>
            下一页
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </main>
  );
}

function readMasteredFilter(value: string): MasteredFilter {
  return value === 'mastered' || value === 'unmastered' ? value : 'all';
}
