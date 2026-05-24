/**
 * ExamModePicker —— `/exam` 模式选择页的客户端容器。
 *
 * 由 Server Component(`page.tsx`)预加载题库列表、当前用户的 `ONGOING` 会话
 * 与全局分类树后传入；本组件负责在浏览器侧渲染:
 *
 *  - 每个题库一张卡片,卡内并排 4 个模式按钮(顺序 / 随机 / 章节 / 模考)。
 *  - 跨题库的"错题重做"独立放在最末尾的一张全宽卡片。
 *  - 当 `(mode, bankId)` 已存在 `ONGOING` 会话时,主按钮文案变为"继续上次",
 *    并在按钮下方提供"放弃后重开"次级动作(对应需求 1.8)。
 *  - 章节模式触发 `CategorySelectDialog`;选完分类后再调
 *    `startSession({ mode: 'CHAPTER', ... })`。
 *  - 其它模式直接调 `startSession`。成功跳 `/exam/session/[attemptId]`,
 *    失败用 `sonner.toast.error` 反馈。
 *
 * 使用 `useTransition` 标记 pending,避免重复点击。
 *
 * @see Requirements 1.1, 1.2, 1.5, 1.8
 */
'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { EXAM_MODE_DISPLAY, type ExamMode } from '@/lib/exam-engine/types';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { abandonSession, startSession, type StartSessionInput } from '../actions';
import { CategorySelectDialog } from './category-select-dialog';

interface BankItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  questionCount: number;
}

interface OngoingAttempt {
  id: string;
  mode: string;
  bankId: string | null;
  startedAt: Date;
}

interface CategoryItem {
  id: string;
  name: string;
  parentId: string | null;
}

interface ExamModePickerProps {
  banks: BankItem[];
  ongoingAttempts: OngoingAttempt[];
  categories: CategoryItem[];
}

/** 题库卡片内部展示的练习模式(不含跨题库的错题重做)。 */
const BANK_MODES: ExamMode[] = ['SEQUENTIAL', 'RANDOM', 'CHAPTER', 'MOCK'];

/**
 * 把 `(mode, bankId)` 唯一标识到一条 `ONGOING` 会话(如果存在的话)。
 * `WRONG_REVIEW` 模式 `bankId === null`,所以传入 `null` 即可匹配。
 */
function findOngoing(
  attempts: OngoingAttempt[],
  mode: ExamMode,
  bankId: string | null,
): OngoingAttempt | undefined {
  return attempts.find((a) => a.mode === mode && a.bankId === bankId);
}

export function ExamModePicker({
  banks,
  ongoingAttempts,
  categories,
}: ExamModePickerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /**
   * 章节模式弹窗状态。打开时需要记住当前题库 id,确认时再据此发起 `startSession`。
   */
  const [chapterDialog, setChapterDialog] = useState<{
    open: boolean;
    bankId: string | null;
  }>({ open: false, bankId: null });

  /**
   * 调 `startSession` 并跳转到会话页。失败时 toast 提示并保持当前页。
   */
  function go(input: StartSessionInput) {
    startTransition(async () => {
      const res = await startSession(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(`/exam/session/${res.data.attemptId}`);
    });
  }

  /** "继续上次"按钮:直接跳到对应会话页。 */
  function resume(attemptId: string) {
    router.push(`/exam/session/${attemptId}`);
  }

  /**
   * "放弃后重开":先调 `abandonSession` 把旧会话置为 ABANDONED,
   * 再用相同入参调 `startSession`(此时不再命中"已存在 ONGOING 会话"分支)。
   *
   * 章节模式的"放弃后重开"会先弹出分类选择对话框,确认后再走完整流程——
   * 因为 `categoryIds` 只能在 dialog 中由用户选定,所以无法在这里构造完整入参。
   */
  function discardAndRestart(
    attemptId: string,
    mode: ExamMode,
    bankId: string | null,
  ) {
    if (mode === 'CHAPTER') {
      if (!bankId) return;
      // 弹出 dialog,记下待放弃的会话;真正的 abandon + start 在 dialog 确认时做。
      pendingDiscardRef.current = attemptId;
      setChapterDialog({ open: true, bankId });
      return;
    }
    if (
      !window.confirm(
        '放弃当前进行中的会话并重新开始?该会话将被标记为已放弃,统计字段会按现有答题情况结算。',
      )
    ) {
      return;
    }
    const input: StartSessionInput =
      mode === 'WRONG_REVIEW'
        ? { mode: 'WRONG_REVIEW' }
        : { mode, bankId: bankId! };
    startTransition(async () => {
      const abandonRes = await abandonSession(attemptId);
      if (!abandonRes.ok) {
        toast.error(abandonRes.error);
        return;
      }
      const startRes = await startSession(input);
      if (!startRes.ok) {
        toast.error(startRes.error);
        return;
      }
      router.push(`/exam/session/${startRes.data.attemptId}`);
    });
  }

  /**
   * 章节模式"放弃后重开"时,需要在 dialog 确认后再调用 `abandonSession`。
   * 这里用 `useRef` 在多次渲染间持有待放弃的 attemptId;不参与渲染,因此
   * 不需要 `useState`。
   */
  const pendingDiscardRef = useRef<string | null>(null);

  /**
   * 渲染单个模式按钮(含"继续上次 / 放弃后重开"分支)。
   */
  function renderModeButton(bankId: string | null, mode: ExamMode) {
    const ongoing = findOngoing(ongoingAttempts, mode, bankId);
    const label = EXAM_MODE_DISPLAY[mode];

    if (ongoing) {
      return (
        <div key={mode} className="flex flex-col gap-1">
          <Button
            variant="default"
            size="sm"
            disabled={pending}
            onClick={() => resume(ongoing.id)}
            title={`继续上次 ${label}`}
          >
            继续上次 · {label}
          </Button>
          <button
            type="button"
            disabled={pending}
            onClick={() => discardAndRestart(ongoing.id, mode, bankId)}
            className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:pointer-events-none text-left"
          >
            放弃后重开
          </button>
        </div>
      );
    }

    return (
      <Button
        key={mode}
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (mode === 'CHAPTER') {
            setChapterDialog({ open: true, bankId });
            return;
          }
          if (mode === 'WRONG_REVIEW') {
            go({ mode: 'WRONG_REVIEW' });
            return;
          }
          // 顺序 / 随机 / 模考:必有 bankId(由 BANK_MODES 渲染上下文保证)。
          if (!bankId) return;
          go({ mode, bankId });
        }}
      >
        {label}
      </Button>
    );
  }

  /**
   * 章节对话框确认回调:
   * 1) 如果是"放弃后重开"路径(`pendingDiscardRef.current` 非空),
   *    先放弃旧会话再开新会话;
   * 2) 否则直接 `startSession`。
   */
  function handleChapterConfirm(selectedIds: string[]) {
    const bankId = chapterDialog.bankId;
    if (!bankId) return;
    const input: StartSessionInput = {
      mode: 'CHAPTER',
      bankId,
      categoryIds: selectedIds,
    };
    const toAbandon = pendingDiscardRef.current;
    pendingDiscardRef.current = null;

    startTransition(async () => {
      if (toAbandon) {
        const abandonRes = await abandonSession(toAbandon);
        if (!abandonRes.ok) {
          toast.error(abandonRes.error);
          return;
        }
      }
      const res = await startSession(input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setChapterDialog({ open: false, bankId: null });
      router.push(`/exam/session/${res.data.attemptId}`);
    });
  }

  // 错题重做卡片所需的 `ONGOING` 会话(`bankId === null`)。
  const wrongReviewOngoing = findOngoing(ongoingAttempts, 'WRONG_REVIEW', null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {banks.map((bank) => (
          <Card key={bank.id} className="hover:border-primary/40 transition-colors">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{bank.name}</CardTitle>
                <Badge variant="muted" className="shrink-0">
                  {bank.questionCount} 题
                </Badge>
              </div>
              {bank.description ? (
                <CardDescription>{bank.description}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {BANK_MODES.map((mode) => renderModeButton(bank.id, mode))}
            </CardContent>
          </Card>
        ))}

        {banks.length === 0 ? (
          <Card className="sm:col-span-2">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              暂无可用题库,请联系管理员录入题目。
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* 跨题库的错题重做卡片 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">📒 错题重做</CardTitle>
              <CardDescription>
                从你的错题本中抽取尚未掌握的题目,按最近答错时间倒序练习。
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {wrongReviewOngoing ? (
            <div className="flex flex-col gap-1 items-start">
              <Button
                variant="default"
                size="sm"
                disabled={pending}
                onClick={() => resume(wrongReviewOngoing.id)}
              >
                继续上次 · 错题重做
              </Button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  discardAndRestart(wrongReviewOngoing.id, 'WRONG_REVIEW', null)
                }
                className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:pointer-events-none"
              >
                放弃后重开
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => go({ mode: 'WRONG_REVIEW' })}
            >
              开始错题重做
            </Button>
          )}
        </CardContent>
      </Card>

      <CategorySelectDialog
        open={chapterDialog.open}
        onOpenChange={(open) => {
          // dialog 关闭时清理待放弃的会话引用,避免下一轮误用。
          if (!open) pendingDiscardRef.current = null;
          setChapterDialog((prev) => ({ ...prev, open }));
        }}
        categories={categories}
        onConfirm={handleChapterConfirm}
        pending={pending}
      />
    </>
  );
}
