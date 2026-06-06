import Link from 'next/link';
import { ArrowLeft, DownloadCloud } from 'lucide-react';

import { requireUser } from '@/lib/server-session';
import { WukongImportClient } from './wukong-client';

export default function WukongImportPage() {
  requireUser('question:import');

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin/questions/import">
          <ArrowLeft size={17} aria-hidden="true" />
          返回批量导入
        </Link>
        <span className="badge good">
          <DownloadCloud size={15} aria-hidden="true" />
          授权迁移
        </span>
        <h1>悟空交规迁移中心</h1>
        <p>使用授权账号扫描可见题库，选择章节后导入题目、解析和图片。</p>
      </div>
      <WukongImportClient />
    </main>
  );
}
