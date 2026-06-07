import type { Prisma } from '@prisma/client';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FilePlus2,
  FolderTree,
  Pencil,
  Search,
 Upload,
 DownloadCloud,
} from 'lucide-react';

import { prisma } from '@/lib/db';
import { QUESTION_TYPES, type QuestionType } from '@/lib/enums';
import { QUESTION_TYPE_LABEL, formatDateTime } from '@/lib/display';
import { requireUser } from '@/lib/server-session';

type QuestionsPageProps = {
  searchParams?: {
    bankId?: string;
    type?: string;
    q?: string;
    page?: string;
    error?: string;
    notice?: string;
  };
};

export default async function QuestionsPage({ searchParams }: QuestionsPageProps) {
  requireUser('question:read');
  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const type = readQuestionType(searchParams?.type ?? '');
  const q = (searchParams?.q ?? '').trim();
  const bankId = searchParams?.bankId || undefined;
  const where: Prisma.QuestionWhereInput = {
    ...(bankId ? { bankId } : {}),
    ...(type ? { type } : {}),
    ...(q ? { content: { contains: q } } : {}),
  };

  const [banks, rows, total] = await Promise.all([
    prisma.questionBank.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.question.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 20,
      take: 20,
      include: { bank: true, categories: { include: { category: true } } },
    }),
    prisma.question.count({ where }),
  ]);

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin">
          <ArrowLeft size={17} aria-hidden="true" />
          返回后台
        </Link>
        <h1>题目管理</h1>
        <p>按题库、题型和关键字快速筛选题目。题目创建后立即进入练习池。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}
      {searchParams?.notice ? <div className="notice">{searchParams.notice}</div> : null}

      <section className="panel stack">
        <div className="cluster">
          <Link className="button primary" href="/admin/questions/new">
            <FilePlus2 size={17} aria-hidden="true" />
            新建题目
          </Link>
 <Link className="button" href="/admin/questions/import">
 <Upload size={17} aria-hidden="true" />
 批量导入
 </Link>
 <Link className="button" href="/admin/questions/import/wukong">
 <DownloadCloud size={17} aria-hidden="true" />
 悟空同步
 </Link>
 <Link className="button" href="/admin/categories">
            <FolderTree size={17} aria-hidden="true" />
            分类管理
          </Link>
        </div>
        <form className="grid">
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
            <label htmlFor="type">
              <ClipboardList size={15} aria-hidden="true" />
              题型
            </label>
            <select id="type" name="type" defaultValue={type ?? ''}>
              <option value="">全部题型</option>
              {QUESTION_TYPES.map((item) => (
                <option key={item} value={item}>
                  {QUESTION_TYPE_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="q">
              <Search size={15} aria-hidden="true" />
              关键字
            </label>
            <input id="q" name="q" defaultValue={q} placeholder="题干关键字" />
          </div>
          <button className="primary" type="submit">
            <Search size={17} aria-hidden="true" />
            筛选
          </button>
        </form>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>题目</th>
              <th>题库</th>
              <th>题型</th>
              <th>分类</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((question) => (
              <tr key={question.id}>
                <td>{question.content}</td>
                <td>{question.bank.name}</td>
                <td>{QUESTION_TYPE_LABEL[question.type as QuestionType]}</td>
                <td>
                  {question.categories.length === 0
                    ? '-'
                    : question.categories.map((item) => item.category.name).join('、')}
                </td>
                <td>{formatDateTime(question.createdAt)}</td>
                <td>
                  <div className="cluster">
                    <Link className="button" href={`/admin/questions/${question.id}`}>
                      <Eye size={16} aria-hidden="true" />
                      详情
                    </Link>
                    <Link className="button" href={`/admin/questions/${question.id}/edit`}>
                      <Pencil size={16} aria-hidden="true" />
                      编辑
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="empty">暂无题目</div> : null}
      </section>

      <Pagination page={page} total={total} />
    </main>
  );
}

function Pagination({ page, total }: { page: number; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / 20));
  return (
    <div className="cluster">
      <span className="muted">
        第 {page} / {totalPages} 页，共 {total} 题
      </span>
      {page > 1 ? (
        <Link className="button" href={`/admin/questions?page=${page - 1}`}>
          <ChevronLeft size={16} aria-hidden="true" />
          上一页
        </Link>
      ) : null}
      {page < totalPages ? (
        <Link className="button" href={`/admin/questions?page=${page + 1}`}>
          下一页
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function readQuestionType(value: string): QuestionType | null {
  return QUESTION_TYPES.includes(value as QuestionType) ? (value as QuestionType) : null;
}
