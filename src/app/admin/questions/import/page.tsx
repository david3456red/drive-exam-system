import Link from 'next/link';
import { ArrowLeft, DownloadCloud, Inbox } from 'lucide-react';

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
          <ArrowLeft size={17} aria-hidden="true" />
          返回题目
        </Link>
 <h1>批量导入</h1>
 <p>先预览行级校验结果，再确认写入题库。</p>
 <Link className="button" href="/admin/questions/import/wukong">
 <DownloadCloud size={17} aria-hidden="true" />
 悟空交规迁移
 </Link>
 </div>
      {banks.length === 0 ? (
        <div className="empty">
          <Inbox size={18} aria-hidden="true" />
          暂无题库
        </div>
      ) : (
        <ImportClient banks={banks} />
      )}
    </main>
  );
}
