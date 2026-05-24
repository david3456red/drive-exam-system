import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Pencil, Plus, Upload } from 'lucide-react';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { QUESTION_TYPE_DISPLAY, type QuestionType } from '@/lib/question-types';
import { QuestionsFilter } from './questions-filter';
import { DeleteQuestionButton } from './delete-question-button';

const PAGE_SIZE = 20;

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: { bank?: string; type?: string; q?: string; page?: string };
}) {
  const session = await auth();
  if (!hasPermission(session!.user, 'question:read')) redirect('/admin');

  const u = session!.user;
  const canCreate = hasPermission(u, 'question:create');
  const canUpdate = hasPermission(u, 'question:update');
  const canDelete = hasPermission(u, 'question:delete');
  const canImport = hasPermission(u, 'question:import');

  const page = Math.max(1, Number(searchParams.page) || 1);
  const filter: {
    bankId?: string;
    type?: QuestionType;
    content?: { contains: string };
  } = {};
  if (searchParams.bank) filter.bankId = searchParams.bank;
  if (searchParams.type && ['SINGLE', 'MULTI', 'JUDGE'].includes(searchParams.type)) {
    filter.type = searchParams.type as QuestionType;
  }
  if (searchParams.q) filter.content = { contains: searchParams.q };

  const [banks, total, questions] = await Promise.all([
    prisma.questionBank.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, code: true },
    }),
    prisma.question.count({ where: filter }),
    prisma.question.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        bank: { select: { name: true, code: true } },
        categories: { include: { category: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Build query string (without page) so pagination links can append page=X.
  const qsBase = new URLSearchParams();
  if (searchParams.bank) qsBase.set('bank', searchParams.bank);
  if (searchParams.type) qsBase.set('type', searchParams.type);
  if (searchParams.q) qsBase.set('q', searchParams.q);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">题目</h1>
          <p className="text-muted-foreground text-sm mt-1">管理题库内的题目,支持单题增改删与批量导入。</p>
        </div>
        <div className="flex gap-2">
          {canImport && (
            <Button asChild variant="outline">
              <Link href="/admin/questions/import">
                <Upload className="h-4 w-4 mr-1" /> 批量导入
              </Link>
            </Button>
          )}
          {canCreate && (
            <Button asChild>
              <Link href="/admin/questions/new">
                <Plus className="h-4 w-4 mr-1" /> 新建题目
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <QuestionsFilter banks={banks} />

          <div className="text-sm text-muted-foreground">
            共 <span className="font-mono text-foreground">{total}</span> 条
            {(searchParams.bank || searchParams.type || searchParams.q) && (
              <span className="ml-2">(已过滤)</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">题型</th>
                  <th className="py-2 pr-3">题干</th>
                  <th className="py-2 pr-3">题库</th>
                  <th className="py-2 pr-3">分类</th>
                  <th className="py-2 pr-3">答案</th>
                  <th className="py-2 pr-3 w-24">操作</th>
                </tr>
              </thead>
              <tbody>
                {questions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground">
                      暂无题目。先创建一个题库,然后新增题目或批量导入吧 ✨
                    </td>
                  </tr>
                )}
                {questions.map((q) => (
                  <tr key={q.id} className="border-b last:border-b-0 align-top">
                    <td className="py-3 pr-3">
                      <Badge variant="outline">
                        {QUESTION_TYPE_DISPLAY[q.type as QuestionType] ?? q.type}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3 max-w-md">
                      <div className="line-clamp-2">{q.content}</div>
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <div>{q.bank.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{q.bank.code}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {q.categories.length === 0 && (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                        {q.categories.map((c) => (
                          <Badge key={c.category.id} variant="muted">
                            {c.category.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono">{q.answer}</td>
                    <td className="py-3 pr-3">
                      <div className="flex gap-1">
                        {canUpdate && (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/admin/questions/${q.id}`} aria-label="编辑">
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                        {canDelete && (
                          <DeleteQuestionButton id={q.id} content={q.content} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                第 {page} / {totalPages} 页
              </div>
              <div className="flex gap-1">
                {page > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/admin/questions?${(() => {
                        const p = new URLSearchParams(qsBase);
                        p.set('page', String(page - 1));
                        return p.toString();
                      })()}`}
                    >
                      上一页
                    </Link>
                  </Button>
                )}
                {page < totalPages && (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/admin/questions?${(() => {
                        const p = new URLSearchParams(qsBase);
                        p.set('page', String(page + 1));
                        return p.toString();
                      })()}`}
                    >
                      下一页
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
