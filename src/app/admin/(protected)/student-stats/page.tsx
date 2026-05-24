/**
 * 教练后台 - 学员列表页 `/admin/student-stats`
 *
 * 服务端组件,展示所有学员账号(角色为 `student_strict` / `student_normal`)
 * 的统计概览:总答题次数、平均正确率、最近练习时间。点击任意一行可跳转到
 * 对应学员的历史详情页 `/admin/student-stats/[userId]`。
 *
 * 设计要点:
 *
 * - 权限:`stats:all`(教练 / 管理员 / 超管),失败时 `redirect('/admin')`,
 *   与设计文档需求 11.4 / 11.5 对齐。
 * - 数据:复用 `@/lib/exam-engine/queries` 的 `listStudents` 分页查询;
 *   平均正确率口径仅统计 `FINISHED + ABANDONED` 的会话,`ONGOING` 不计入。
 * - 分页:URL 参数 `?page=N`,底部"上一页 / 下一页"按钮渲染为 `<Link>`,
 *   保持纯服务端,刷新即可重新获取数据。
 * - 空状态:无学员或当前页超界时显示"暂无数据"。
 */

import { auth } from '@/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { listStudents } from '@/lib/exam-engine/queries';
import { hasPermission } from '@/lib/permissions';
import Link from 'next/link';
import { redirect } from 'next/navigation';

const PAGE_SIZE = 20;

/** 把日期格式化为 `YYYY-MM-DD HH:mm`。`null` 时返回 `-`。 */
function formatDateTime(d: Date | null): string {
  if (!d) return '-';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/** 平均正确率展示:`null` 显示 `-`,否则带百分号保留一位小数。 */
function formatAccuracy(v: number | null): string {
  if (v === null || v === undefined) return '-';
  return `${v.toFixed(1)}%`;
}

export default async function StudentStatsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  if (!hasPermission(session!.user, 'stats:all')) redirect('/admin');

  const page = Math.max(1, Number(searchParams.page) || 1);

  const { items, total, pageSize } = await listStudents({ page, pageSize: PAGE_SIZE });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">学员成绩</h1>
        <p className="text-muted-foreground text-sm mt-1">
          查看所有学员的总答题次数、平均正确率与最近练习时间。点击任一行查看历史详情。
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-sm text-muted-foreground">
            共 <span className="font-mono text-foreground">{total}</span> 名学员
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">用户名</th>
                  <th className="py-2 pr-3">姓名</th>
                  <th className="py-2 pr-3">总答题次数</th>
                  <th className="py-2 pr-3">平均正确率</th>
                  <th className="py-2 pr-3">最近练习</th>
                  <th className="py-2 pr-3 w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-muted-foreground">
                      暂无数据
                    </td>
                  </tr>
                )}
                {items.map((u) => {
                  const href = `/admin/student-stats/${u.id}`;
                  return (
                    <tr
                      key={u.id}
                      className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
                    >
                      <td className="p-0">
                        <Link href={href} className="block py-3 pr-3 pl-0 font-mono text-xs">
                          {u.username}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block py-3 pr-3">
                          {u.name}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block py-3 pr-3">
                          <Badge variant="muted">{u.totalAttempts}</Badge>
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={href} className="block py-3 pr-3 font-mono">
                          {formatAccuracy(u.averageAccuracy)}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link
                          href={href}
                          className="block py-3 pr-3 whitespace-nowrap font-mono text-xs"
                        >
                          {formatDateTime(u.lastPracticeAt)}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link
                          href={href}
                          className="block py-3 pr-3 text-primary hover:underline"
                        >
                          查看 →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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
                    <Link href={`/admin/student-stats?page=${page - 1}`}>上一页</Link>
                  </Button>
                )}
                {page < totalPages && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/student-stats?page=${page + 1}`}>下一页</Link>
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
