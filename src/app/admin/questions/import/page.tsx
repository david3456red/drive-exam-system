import Link from 'next/link';

import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/server-session';
import { ImportClient } from './import-client';

export default async function QuestionImportPage() {
  requireUser('question:import');
  const banks = await prisma.questionBank.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin/questions">
          返回题目
        </Link>
        <h1>批量导入</h1>
        <p>先预览行级校验结果，再确认写入题库。</p>
      </div>
      {banks.length === 0 ? (
        <div className="empty">暂无题库</div>
      ) : (
        <ImportClient banks={banks} />
      )}
    </main>
  );
}
