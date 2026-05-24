/**
 * 学员答题记录列表页 `/exam/history`
 *
 * Server Component:
 *
 * - 通过 `auth()` 获取当前学员,并以 `userId` 调用 `listAttempts` 拉取分页数据。
 * - URL 查询参数 `?page=N`(默认 1)控制页码,固定 `pageSize = 20`,与
 *   设计文档 Property 12 保持一致。
 * - 表格列与需求 9.2 对齐:模式 / 题库 / 开始时间 / 总题数 / 正确数 /
 *   正确率 / 用时 / 状态。点击整行跳转到 `/exam/history/[attemptId]`
 *   详情页(由 16.8 实现)。
 * - `bankId` 为空表示"错题回顾"模式(`WRONG_REVIEW`)的会话,题库列展示
 *   "错题回顾"占位文案。
 * - `score` 为 `null` 时正确率展示 `-`(覆盖会话总题数为 0 的极端情况)。
 * - 空状态展示"暂无答题记录"。
 */

import { auth } from '@/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { listAttempts } from '@/lib/exam-engine/queries';
import { EXAM_MODE_DISPLAY, type ExamMode } from '@/lib/exam-engine/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';

const PAGE_SIZE = 20;

/**
 * 把数字补零到 2 位,用于日期/时间格式化。
 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 格式化为 `YYYY-MM-DD HH:mm`(本地时区)。
 */
function formatDateTime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/**
 * 把 `durationMs` 格式化为 `mm:ss`;`null` / 负数兜底为 `00:00`。
 * 时长不限制 60 分钟上限——超过时按 `MM:SS` 累加(如 `75:42`)。
 */
function formatDuration(durationMs: number | null): string {
  if (durationMs == null || durationMs < 0) return '00:00';
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

/**
 * 把整数 `score`(0-100)展示为保留一位小数的百分比字符串。
 * `null` 返回 `-`。
 */
function formatAccuracy(score: number | null): string {
  if (score == null) return '-';
  return `${score.toFixed(1)}%`;
}

export default async function ExamHistoryPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const page = Math.max(1, Number(searchParams.page) || 1);

  const { items, total } = await listAttempts({
    userId: session.user.id,
    page,
    pageSize: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">答题记录</h1>
        <p className="text-muted-foreground text-sm mt-1">
          查看历次练习与模考的成绩,点击任一条目可查看逐题详情。
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-sm text-muted-foreground">
            共 <span className="font-mono text-foreground">{total}</span> 条
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">练习模式</th>
                  <th className="py-2 pr-3">题库</th>
                  <th className="py-2 pr-3">开始时间</th>
                  <th className="py-2 pr-3">总题数 / 正确数</th>
                  <th className="py-2 pr-3">正确率</th>
                  <th className="py-2 pr-3">用时</th>
                  <th className="py-2 pr-3">状态</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-muted-foreground"
                    >
                      暂无答题记录
                    </td>
                  </tr>
                )}
                {items.map((a) => {
                  const modeLabel =
                    EXAM_MODE_DISPLAY[a.mode as ExamMode] ?? a.mode;
                  const bankLabel = a.bank?.name ?? '错题回顾';
                  return (
                    <tr
                      key={a.id}
                      className="border-b last:border-b-0 hover:bg-muted/50 transition-colors relative"
                    >
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {modeLabel}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {bankLabel}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap font-mono text-xs">
                        {formatDateTime(a.startedAt)}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap font-mono">
                        {a.totalCount} / {a.correctCount}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap font-mono">
                        {formatAccuracy(a.score)}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap font-mono">
                        {formatDuration(a.durationMs)}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {a.status === 'FINISHED' ? (
                          <Badge variant="success">已完成</Badge>
                        ) : (
                          <Badge variant="muted">未完成</Badge>
                        )}
                        {/* 让整行可点击:绝对定位的链接覆盖整行,
                            优先级低于内部交互元素(目前没有)即可。 */}
                        <Link
                          href={`/exam/history/${a.id}`}
                          aria-label={`查看 ${modeLabel} 详情`}
                          className="absolute inset-0"
                        >
                          <span className="sr-only">查看详情</span>
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
                {page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`?page=${page - 1}`}>上一页</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    上一页
                  </Button>
                )}
                {page < totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`?page=${page + 1}`}>下一页</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    下一页
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
