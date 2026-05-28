import Link from 'next/link';

import { createBankAction, deleteBankAction } from '@/app/admin/actions';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/server-session';

type BanksPageProps = {
  searchParams?: { error?: string; notice?: string };
};

export default async function BanksPage({ searchParams }: BanksPageProps) {
  requireUser('bank:read');
  const banks = await prisma.questionBank.findMany({
    orderBy: [{ isBuiltin: 'desc' }, { createdAt: 'asc' }],
    include: { _count: { select: { questions: true, attempts: true } } },
  });

  return (
    <main className="page stack">
      <Header title="题库管理" />
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}
      {searchParams?.notice ? <div className="notice">{searchParams.notice}</div> : null}

      <section className="panel stack">
        <h2>新建或更新题库</h2>
        <form action={createBankAction} className="grid">
          <div className="field">
            <label htmlFor="code">题库编码</label>
            <input id="code" name="code" placeholder="subject_1" required />
          </div>
          <div className="field">
            <label htmlFor="name">题库名称</label>
            <input id="name" name="name" placeholder="科目一" required />
          </div>
          <button className="primary" type="submit">
            保存题库
          </button>
        </form>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>编码</th>
              <th>名称</th>
              <th>题量</th>
              <th>属性</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {banks.map((bank) => {
              const locked = bank.isBuiltin || bank._count.questions > 0;
              return (
                <tr key={bank.id}>
                  <td>{bank.code}</td>
                  <td>{bank.name}</td>
                  <td>{bank._count.questions}</td>
                  <td>
                    {bank.isBuiltin ? <span className="badge good">内置</span> : <span className="badge">自建</span>}
                  </td>
                  <td>
                    <div className="cluster">
                      <Link className="button" href={`/admin/questions?bankId=${bank.id}`}>
                        查看题目
                      </Link>
                      <form action={deleteBankAction}>
                        <input type="hidden" name="id" value={bank.id} />
                        <button
                          className="danger"
                          disabled={locked}
                          title={locked ? '内置题库或已有题目时不可删除' : '删除题库'}
                          type="submit"
                        >
                          删除
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="page-title">
      <Link className="button" href="/admin">
        返回后台
      </Link>
      <h1>{title}</h1>
      <p>内置题库保留系统默认科目，自建题库可用于机构扩展。</p>
    </div>
  );
}
