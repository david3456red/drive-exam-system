import Link from 'next/link';
import { ArrowLeft, FolderTree, Save, Trash2 } from 'lucide-react';

import { createCategoryAction, deleteCategoryAction } from '@/app/admin/actions';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { requireUser } from '@/lib/server-session';

type CategoriesPageProps = {
  searchParams?: { error?: string; notice?: string };
};

export default async function CategoriesPage({ searchParams }: CategoriesPageProps) {
 const user = requireUser('category:read');
 const categories = await prisma.category.findMany({
    orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { children: true, questions: true } } },
 });
 const nameById = new Map(categories.map((item) => [item.id, item.name]));
 const canWriteCategory = hasPermission({ user }, 'category:write');
 const canDeleteCategory = hasPermission({ user }, 'category:delete');

  return (
    <main className="page stack">
      <div className="page-title">
        <Link className="button" href="/admin">
          <ArrowLeft size={17} aria-hidden="true" />
          返回后台
        </Link>
        <h1>分类管理</h1>
        <p>分类是章节练习的筛选依据。删除分类会同步移除题目挂载关系。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}
      {searchParams?.notice ? <div className="notice">{searchParams.notice}</div> : null}

 {canWriteCategory ? (
 <section className="panel stack">
 <h2>新建分类</h2>
 <form action={createCategoryAction} className="grid">
          <div className="field">
            <label htmlFor="name">
              <FolderTree size={15} aria-hidden="true" />
              分类名称
            </label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="parentId">
              <FolderTree size={15} aria-hidden="true" />
              上级分类
            </label>
            <select id="parentId" name="parentId">
              <option value="">顶级分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" type="submit">
            <Save size={17} aria-hidden="true" />
            创建分类
 </button>
 </form>
 </section>
 ) : null}

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>分类</th>
              <th>上级</th>
              <th>子分类</th>
              <th>挂载题目</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>{category.parentId ? nameById.get(category.parentId) ?? '-' : '顶级'}</td>
                <td>{category._count.children}</td>
                <td>{category._count.questions}</td>
                <td>
 {canDeleteCategory ? (
 <form action={deleteCategoryAction}>
 <input type="hidden" name="id" value={category.id} />
 <button
                      className="danger"
                      disabled={category._count.children > 0}
                      title={category._count.children > 0 ? '请先删除子分类' : '删除分类'}
                      type="submit"
                    >
                      <Trash2 size={16} aria-hidden="true" />
 删除
 </button>
 </form>
 ) : (
 <span className="badge">只读</span>
 )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
