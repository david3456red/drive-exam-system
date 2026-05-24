'use client';

/**
 * 错题本列表客户端组件 (`/exam/wrong` 页的核心交互层)。
 *
 * 由父级 Server Component (`page.tsx`) 完成数据查询后传入,本组件只负责:
 *
 * - 渲染顶部筛选条:题库下拉 + "全部 / 未掌握 / 已掌握"标签页(用按钮组实现)
 *   - 切换任意筛选项都会用 `router.push` 把状态写到 URL 上,
 *     并保留其它筛选参数,刷新页面/分享链接时筛选不会丢失。
 * - 渲染错题列表:每条展示题目内容、错对次数、掌握状态、最近答错时间,
 *   以及"标记掌握 / 取消掌握"按钮。
 * - 调用 `toggleMastered` Server Action 切换掌握状态,
 *   - 用 `useTransition` 提供 pending 状态(按钮禁用 + 文案切换),
 *   - 成功后用 `router.refresh()` 让 Server Component 重读数据;
 *   - 失败时回滚到原状态并通过 `sonner` 的 `toast.error` 反馈
 *     (对应需求 10.7 / Error Handling 中的"错题本错误"约定)。
 * - 渲染底部分页器(上一页 / 下一页),保留所有筛选参数。
 * - 空状态文案"暂无错题"(对应需求 10.6)。
 *
 * 受控于父组件传入的当前筛选值 (`bankId / masteredFilter`) 与分页参数,
 * 自身不持有这些状态——所有跳转都是 URL 驱动的,这与项目其它列表页
 * (例如 `admin/(protected)/questions`)的写法一致。
 */

import { toggleMastered } from '@/app/(student)/exam/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SelectNative } from '@/components/ui/select-native';
import { QUESTION_TYPE_DISPLAY, type QuestionType } from '@/lib/question-types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

/** 与 `listWrongQuestions` 的返回项保持一致(只取 UI 需要的字段)。 */
export type WrongItem = {
  id: string;
  questionId: string;
  question: { id: string; type: string; content: string; bankId: string };
  wrongCount: number;
  rightCount: number;
  mastered: boolean;
  lastWrongAt: Date;
};

export type MasteredFilter = 'all' | 'mastered' | 'unmastered';

interface WrongListProps {
  items: WrongItem[];
  total: number;
  page: number;
  pageSize: number;
  bankId: string | undefined;
  masteredFilter: MasteredFilter;
  banks: { id: string; name: string }[];
}

/**
 * 把当前筛选 + 目标分页拼成 `/exam/wrong` 路径,空值不写入 URL,
 * 保持链接干净。
 */
function buildHref(params: {
  page?: number;
  bankId?: string;
  masteredFilter?: MasteredFilter;
}): string {
  const qs = new URLSearchParams();
  if (params.bankId) qs.set('bankId', params.bankId);
  if (params.masteredFilter && params.masteredFilter !== 'all') {
    qs.set('mastered', params.masteredFilter);
  }
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  const s = qs.toString();
  return s ? `/exam/wrong?${s}` : '/exam/wrong';
}

/** 把 Date 格式化成 `YYYY-MM-DD HH:mm`(避免 Intl 在 SSR/CSR 间出现差异)。 */
function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WrongList({
  items,
  total,
  page,
  pageSize,
  bankId,
  masteredFilter,
  banks,
}: WrongListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /** 题库下拉切换时,重置回第 1 页,保持掌握状态筛选不变。 */
  function onBankChange(nextBankId: string) {
    router.push(
      buildHref({
        page: 1,
        bankId: nextBankId || undefined,
        masteredFilter,
      }),
    );
  }

  /** 掌握状态 tabs 切换时,同样重置回第 1 页。 */
  function onMasteredChange(next: MasteredFilter) {
    router.push(
      buildHref({
        page: 1,
        bankId,
        masteredFilter: next,
      }),
    );
  }

  /**
   * 标记/取消掌握。`useTransition` 的 pending 期间所有按钮一并禁用,
   * 避免连续点击产生竞态;成功后由 `router.refresh()` 让上层 RSC 重新查询。
   */
  function onToggle(item: WrongItem) {
    const target = !item.mastered;
    startTransition(async () => {
      const res = await toggleMastered({ wrongId: item.id, mastered: target });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(target ? '已标记为已掌握' : '已取消掌握标记');
      router.refresh();
    });
  }

  const masteredTabs: { value: MasteredFilter; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'unmastered', label: '未掌握' },
    { value: 'mastered', label: '已掌握' },
  ];

  return (
    <div className="space-y-4">
      {/* 顶部筛选条 */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="grid gap-3 md:grid-cols-[260px_1fr] items-center">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">题库</div>
              <SelectNative
                value={bankId ?? ''}
                onChange={(e) => onBankChange(e.target.value)}
                disabled={pending}
              >
                <option value="">全部题库</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectNative>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">掌握状态</div>
              <div className="inline-flex rounded-md border bg-background p-0.5">
                {masteredTabs.map((tab) => {
                  const active = tab.value === masteredFilter;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => onMasteredChange(tab.value)}
                      disabled={pending}
                      className={
                        'px-3 py-1.5 text-sm rounded-sm transition-colors disabled:opacity-50 ' +
                        (active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground')
                      }
                      aria-pressed={active}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            共 <span className="font-mono text-foreground">{total}</span> 条
            {(bankId || masteredFilter !== 'all') && <span className="ml-2">(已过滤)</span>}
          </div>
        </CardContent>
      </Card>

      {/* 列表 */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            暂无错题
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">
                      {QUESTION_TYPE_DISPLAY[item.question.type as QuestionType] ??
                        item.question.type}
                    </Badge>
                    {item.mastered ? (
                      <Badge variant="success">已掌握</Badge>
                    ) : (
                      <Badge variant="warning">未掌握</Badge>
                    )}
                  </div>
                  <Button
                    variant={item.mastered ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => onToggle(item)}
                    disabled={pending}
                  >
                    {item.mastered ? '取消掌握' : '标记掌握'}
                  </Button>
                </div>

                <div className="text-sm line-clamp-2">{item.question.content}</div>

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    错误 <span className="font-mono text-foreground">{item.wrongCount}</span> 次
                  </span>
                  <span>
                    正确 <span className="font-mono text-foreground">{item.rightCount}</span> 次
                  </span>
                  <span>最近答错:{formatDateTime(new Date(item.lastWrongAt))}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground">
            第 {page} / {totalPages} 页
          </div>
          <div className="flex gap-1">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={buildHref({ page: page - 1, bankId, masteredFilter })}
                  prefetch={false}
                >
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
                <Link
                  href={buildHref({ page: page + 1, bankId, masteredFilter })}
                  prefetch={false}
                >
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
    </div>
  );
}
