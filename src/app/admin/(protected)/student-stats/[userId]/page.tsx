/**
 * 教练后台 - 单学员答题历史详情页 `/admin/student-stats/[userId]`
 *
 * 服务端组件,承接 `/admin/student-stats` 列表页的"查看 →"链接,展示
 * 单个学员的答题历史明细与汇总卡片。
 *
 * 设计要点:
 *
 * - 权限:`stats:all`(教练 / 管理员 / 超管)。失败时 `redirect('/admin')`,
 *   与 `/admin/student-stats` 列表页保持一致(对应需求 11.4 / 11.5)。
 * - 用户存在性:`getStudentSummary(userId)` 返回 `null` 时调用
 *   `notFound()`,避免直接访问 `/admin/student-stats/<不存在的 id>`。
 * - URL 筛选参数:
 *   - `page`:页码,1-based,非整数归 1。
 *   - `bankId`:精确匹配某题库;空字符串视为"全部"。
 *   - `mode`:答题模式;只接受 `EXAM_MODES` 中的合法值,其它一律忽略。
 * - 顶部卡片:用户名 / 姓名 / 总答题次数 / 平均正确率 / 最近练习时间,
 *   口径与列表页 `listStudents` 完全一致(均来自 `getStudentSummary`)。
 * - 筛选条:`<form method="get">` + `<select>`,纯服务端,提交后由
 *   Next.js 重新走 Server Component,无需客户端 JS。
 * - 表格列与 `/exam/history` 对齐:模式 / 题库 / 开始时间 / 总题/正确 /
 *   正确率 / 用时 / 状态。空状态展示"暂无数据"。
 * - 分页:固定 `pageSize = 20`,底部"上一页 / 下一页"按钮渲染为
 *   `<Link>`,并通过 `hrefWith` 保留当前的 `bankId` / `mode` 筛选参数。
 */

import { auth } from '@/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { getStudentSummary, listAttempts } from '@/lib/exam-engine/queries';
import {
    EXAM_MODES,
    EXAM_MODE_DISPLAY,
    type ExamMode,
} from '@/lib/exam-engine/types';
import { hasPermission } from '@/lib/permissions';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

const PAGE_SIZE = 20;

/** 把数字补零到 2 位,用于日期/时间格式化。 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 格式化为 `YYYY-MM-DD HH:mm`(本地时区);`null` 返回 `-`。 */
function formatDateTime(d: Date | null): string {
  if (!d) return '-';
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

/**
 * 校验 URL 中的 `mode` 参数是否为合法的 `ExamMode`,
 * 是则返回该值,否则返回 `undefined`。
 */
function parseExamMode(value: string | undefined): ExamMode | undefined {
  if (!value) return undefined;
  return (EXAM_MODES as readonly string[]).includes(value)
    ? (value as ExamMode)
    : undefined;
}

export default async function StudentStatsDetailPage(props: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ page?: string; bankId?: string; mode?: string }>;
}) {
  const { userId } = await props.params;
  const sp = await props.searchParams;

  // 权限校验:`stats:all` 失败直接重定向回 `/admin`。
  const session = await auth();
  if (!hasPermission(session!.user, 'stats:all')) redirect('/admin');

  // 用户存在性 + 顶部卡片所需的汇总统计。
  const summary = await getStudentSummary(userId);
  if (!summary || !summary.user) notFound();

  // URL 筛选参数归一化。
  const page = Math.max(1, Number(sp.page) || 1);
  // URL 上的空字符串当作"未选",直接传 undefined。
  const bankId = sp.bankId || undefined;
  const mode = parseExamMode(sp.mode);

  // 答题历史 + 题库下拉数据并发拉取,减少首屏延迟。
  const [{ items, total, pageSize }, banks] = await Promise.all([
    listAttempts({ userId, page, pageSize: PAGE_SIZE, bankId, mode }),
    prisma.questionBank.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /**
   * 构造分页 / 筛选链接。会保留当前的 `bankId` / `mode` 参数,
   * 仅替换 `page`。`page === 1` 时不写入,保持 URL 简洁。
   */
  function hrefWith(params: {
    page?: number;
    bankId?: string;
    mode?: ExamMode;
  }): string {
    const qs = new URLSearchParams();
    if (params.bankId) qs.set('bankId', params.bankId);
    if (params.mode) qs.set('mode', params.mode);
    if (params.page && params.page > 1) qs.set('page', String(params.page));
    const s = qs.toString();
    return s
      ? `/admin/student-stats/${userId}?${s}`
      : `/admin/student-stats/${userId}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/student-stats">← 返回学员列表</Link>
        </Button>
      </div>

      {/* 顶部学员卡片:基本信息 + 汇总统计。 */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-5 text-sm">
            <div>
              <div className="text-muted-foreground">用户名</div>
              <div className="font-mono">{summary.user.username}</div>
            </div>
            <div>
              <div className="text-muted-foreground">姓名</div>
              <div>{summary.user.name}</div>
            </div>
            <div>
              <div className="text-muted-foreground">总答题次数</div>
              <div className="font-mono">{summary.totalAttempts}</div>
            </div>
            <div>
              <div className="text-muted-foreground">平均正确率</div>
              <div className="font-mono">
                {formatAccuracy(summary.averageAccuracy)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">最近练习</div>
              <div className="font-mono text-xs">
                {formatDateTime(summary.lastPracticeAt)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 筛选条 + 历史表格 + 分页。 */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/*
            筛选条:用 `<form method="get">` 实现纯服务端筛选。提交后浏览器
            会带上当前 `<select>` 的值跳转到同一路径,Next.js 会重新走
            Server Component 拉取过滤后的数据。
          */}
          <form className="flex flex-wrap gap-2 items-end" method="get">
            <div className="flex flex-col">
              <label
                className="text-xs text-muted-foreground"
                htmlFor="filter-bankId"
              >
                题库
              </label>
              <select
                id="filter-bankId"
                name="bankId"
                defaultValue={bankId ?? ''}
                className="border rounded px-2 py-1 text-sm bg-background"
              >
                <option value="">全部</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label
                className="text-xs text-muted-foreground"
                htmlFor="filter-mode"
              >
                模式
              </label>
              <select
                id="filter-mode"
                name="mode"
                defaultValue={mode ?? ''}
                className="border rounded px-2 py-1 text-sm bg-background"
              >
                <option value="">全部</option>
                {EXAM_MODES.map((m) => (
                  <option key={m} value={m}>
                    {EXAM_MODE_DISPLAY[m]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm">
              筛选
            </Button>
            {(bankId || mode) && (
              <Button asChild type="button" variant="ghost" size="sm">
                <Link href={`/admin/student-stats/${userId}`}>清除</Link>
              </Button>
            )}
          </form>

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
                      暂无数据
                    </td>
                  </tr>
                )}
                {items.map((a) => {
                  const modeLabel =
                    EXAM_MODE_DISPLAY[a.mode as ExamMode] ?? a.mode;
                  // `bankId === null` 对应错题回顾会话(WRONG_REVIEW)。
                  const bankLabel = a.bank?.name ?? '错题回顾';
                  return (
                    <tr
                      key={a.id}
                      className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
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
                    <Link href={hrefWith({ page: page - 1, bankId, mode })}>
                      上一页
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    上一页
                  </Button>
                )}
                {page < totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={hrefWith({ page: page + 1, bankId, mode })}>
                      下一页
                    </Link>
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
