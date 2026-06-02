import Link from 'next/link';
import { ArrowLeft, ClipboardList, FilePlus2, FolderTree, Image as ImageIcon, Save, Tags } from 'lucide-react';

import { createQuestionAction } from '@/app/admin/actions';
import { prisma } from '@/lib/db';
import { QUESTION_TYPES } from '@/lib/enums';
import { QUESTION_TYPE_LABEL } from '@/lib/display';
import { requireUser } from '@/lib/server-session';

type NewQuestionPageProps = {
  searchParams?: { error?: string };
};

export default async function NewQuestionPage({ searchParams }: NewQuestionPageProps) {
  requireUser('question:write');
  const [banks, categories] = await Promise.all([
    prisma.questionBank.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.category.findMany({ orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }] }),
  ]);

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin/questions">
          <ArrowLeft size={17} aria-hidden="true" />
          返回题目
        </Link>
        <h1>新建题目</h1>
        <p>单选和多选使用 A-F 选项；判断题会自动使用“正确/错误”两个固定选项。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}

      <form action={createQuestionAction} className="panel stack" encType="multipart/form-data">
        <div className="grid">
          <div className="field">
            <label htmlFor="bankId">
              <ClipboardList size={15} aria-hidden="true" />
              题库
            </label>
            <select id="bankId" name="bankId" required>
              <option value="">请选择题库</option>
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
            <select id="type" name="type" defaultValue="SINGLE" required>
              {QUESTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {QUESTION_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="answer">
              <ClipboardList size={15} aria-hidden="true" />
              答案
            </label>
            <input id="answer" name="answer" placeholder="B / AC / T" required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="content">
            <FilePlus2 size={15} aria-hidden="true" />
            题干
          </label>
          <textarea id="content" name="content" required />
        </div>
        <div className="grid">
          <div className="field">
            <label htmlFor="imageUrl">
              <ImageIcon size={15} aria-hidden="true" />
              图片 URL
            </label>
            <input id="imageUrl" name="imageUrl" placeholder="https://..." />
            <span className="muted">可填写外链或已有 /uploads 路径。</span>
          </div>
          <div className="field">
            <label htmlFor="imageFile">
              <ImageIcon size={15} aria-hidden="true" />
              上传图片
            </label>
            <input id="imageFile" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
            <span className="muted">和图片 URL 二选一，支持 JPG / PNG / WebP / GIF，单张不超过 5MB。</span>
          </div>
        </div>

        <section className="grid" aria-label="选项">
          {['A', 'B', 'C', 'D', 'E', 'F'].map((key) => (
            <div className="field" key={key}>
              <label htmlFor={`option${key}`}>选项 {key}</label>
              <input id={`option${key}`} name={`option${key}`} />
            </div>
          ))}
        </section>

        <div className="field">
          <label>
            <FolderTree size={15} aria-hidden="true" />
            分类
          </label>
          <div className="cluster">
            {categories.length === 0 ? (
              <span className="muted">暂无分类</span>
            ) : (
              categories.map((category) => (
                <label className="badge" key={category.id}>
                  <input name="categoryIds" type="checkbox" value={category.id} /> {category.name}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor="explanation">
            <ClipboardList size={15} aria-hidden="true" />
            解析
          </label>
          <textarea id="explanation" name="explanation" />
        </div>
        <div className="field">
          <label htmlFor="tags">
            <Tags size={15} aria-hidden="true" />
            标签
          </label>
          <input id="tags" name="tags" placeholder="易错|标志|高速" />
        </div>

        <button className="primary" type="submit">
          <Save size={17} aria-hidden="true" />
          创建题目
        </button>
      </form>
    </main>
  );
}
