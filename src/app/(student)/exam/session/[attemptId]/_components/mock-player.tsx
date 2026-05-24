'use client';

/**
 * 模拟考试模式答题器 `MockPlayer`
 *
 * 模拟考试模式专用的客户端容器组件，仅渲染当前题目并管理本地交互状态，
 * 与后端的真实结算由 Server Actions（`submitAnswer` / `finishSession`）完成。
 *
 * 设计要点：
 *
 * - **倒计时归零自动交卷**：嵌入 `MockTimer`，传入 `expiresAt`；归零时通过
 *   `onTimeUp` 回调触发 `finishSession` 并跳转到结果页。`finishedRef` 用于在
 *   组件生命周期内最多触发一次结束逻辑，避免与服务端 expiresAt 校验或
 *   `beforeunload` 处理重复结算。
 * - **禁用「上一题」**：模考一旦提交某题就不允许回看修改，`PracticePlayer`
 *   的双向导航在这里被替换为「下一题」单向推进。
 * - **不显示反馈**：模考交卷前不暴露正确答案与解析（与 `submitAnswer` 在
 *   MOCK 模式下不返回 `correctAnswer / explanation` 的契约保持一致），
 *   因此本组件不渲染 `AnswerFeedback`，且 `QuestionView` 的 `feedback` 始终
 *   传 `null`。学员提交后只能看到自己的选择被锁定为只读。
 * - **顶部「交卷」按钮**：触发 `SubmitConfirmDialog` 二次确认，确认后调用
 *   `finishSession` 并跳转到结果页。
 * - **离场处理**：在 `useEffect` 中绑定 `beforeunload`，关闭浏览器/导航离开
 *   时通过 `navigator.sendBeacon('/api/exam/abandon', { attemptId })` 通知后端
 *   把会话结算为 ABANDONED；已经走过 `finishSession` 的会话不再发送 beacon。
 * - **进度展示**：复用 `ProgressBar` 的 MOCK 模式（"第 N/M 题"），右侧插槽
 *   显示倒计时。
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { MockTimer } from '@/app/(student)/exam/_components/mock-timer';
import { ProgressBar } from '@/app/(student)/exam/_components/progress-bar';
import { QuestionView } from '@/app/(student)/exam/_components/question-view';
import { SubmitConfirmDialog } from '@/app/(student)/exam/_components/submit-confirm-dialog';
import { finishSession, submitAnswer } from '@/app/(student)/exam/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { QuestionOption, QuestionType } from '@/lib/question-types';

interface QuestionData {
  id: string;
  type: string;
  content: string;
  imageUrl: string | null;
  options: QuestionOption[];
}

interface ExistingRecord {
  questionId: string;
  userAnswer: string;
}

interface MockPlayerProps {
  attemptId: string;
  questions: QuestionData[];
  initialIndex: number;
  initialRecords: ExistingRecord[];
  expiresAt: Date;
}

/** 把规范化后的答案串拆回 key 数组（QuestionView 受控所需）。 */
function answerToValueArray(answer: string): string[] {
  return answer.split('').filter((c) => c.trim().length > 0);
}

export function MockPlayer({
  attemptId,
  questions,
  initialIndex,
  initialRecords,
  expiresAt,
}: MockPlayerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(questions.length - 1, 0)));

  // 已答题集合：模考不返回反馈，因此这里只记录用户已提交的答案文本。
  const [answeredMap, setAnsweredMap] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    initialRecords.forEach((r) => m.set(r.questionId, r.userAnswer));
    return m;
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [startedAtMs] = useState(() => Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 防止 finishSession 被重复触发（倒计时归零 / 用户点击交卷 / 浏览器关闭）。
  const finishedRef = useRef(false);

  const current = questions[index];
  const isAnswered = answeredMap.has(current.id);
  const qType = current.type as QuestionType;

  // 提交按钮可用性：未答 + 不在 pending + 题型对应的最少选项满足
  const canSubmit =
    !isAnswered &&
    !pending &&
    (qType === 'MULTI' ? selected.length >= 2 : selected.length === 1);

  const isLastQuestion = index === questions.length - 1;
  const unansweredCount = questions.length - answeredMap.size;

  // beforeunload + sendBeacon 离场处理：浏览器关闭时尽力通知后端 abandon。
  useEffect(() => {
    const handler = () => {
      if (finishedRef.current) return;
      const payload = JSON.stringify({ attemptId });
      // 用 Blob 显式声明 application/json，避免某些浏览器把 sendBeacon
      // 默认归类为 text/plain 后被 Route Handler 误判 Content-Type。
      navigator.sendBeacon(
        '/api/exam/abandon',
        new Blob([payload], { type: 'application/json' }),
      );
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [attemptId]);

  function handleSubmit() {
    const userAnswer =
      qType === 'MULTI' ? [...selected].sort().join('') : selected.join('');
    const costMs = Date.now() - startedAtMs;

    startTransition(async () => {
      const res = await submitAnswer({
        attemptId,
        questionId: current.id,
        userAnswer,
        costMs,
      });
      if (!res.ok) {
        toast.error(res.error);
        // 服务端检测到「考试时间已结束」时，立即跳到结果页（服务端已自动结算）。
        if (res.error.includes('考试时间已结束')) {
          finishedRef.current = true;
          router.push(`/exam/session/${attemptId}/result`);
        }
        return;
      }

      // 把当前题目的答案写入本地集合（模考不显示反馈）。
      setAnsweredMap((prev) => new Map(prev).set(current.id, userAnswer));

      // 答完最后一题：自动交卷。`res.data.finished` 与本地长度判断双保险。
      if (res.data.finished || answeredMap.size + 1 === questions.length) {
        finishedRef.current = true;
        const finishRes = await finishSession(attemptId);
        if (!finishRes.ok) {
          toast.error(finishRes.error);
          finishedRef.current = false;
          return;
        }
        router.push(`/exam/session/${attemptId}/result`);
        return;
      }

      // 否则自动前进到下一题，并清空本地选择。
      if (!isLastQuestion) {
        setIndex(index + 1);
        setSelected([]);
      }
    });
  }

  function handleNext() {
    if (isLastQuestion) return;
    const nextIdx = index + 1;
    const nextQ = questions[nextIdx];
    setIndex(nextIdx);
    setSelected(
      answeredMap.has(nextQ.id) ? answerToValueArray(answeredMap.get(nextQ.id)!) : [],
    );
  }

  function handleSubmitExam() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    startTransition(async () => {
      const res = await finishSession(attemptId);
      if (!res.ok) {
        toast.error(res.error);
        finishedRef.current = false;
        return;
      }
      router.push(`/exam/session/${attemptId}/result`);
    });
  }

  function handleTimeUp() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    toast.warning('考试时间到，自动交卷');
    startTransition(async () => {
      const res = await finishSession(attemptId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(`/exam/session/${attemptId}/result`);
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <ProgressBar
          mode="MOCK"
          current={index + 1}
          total={questions.length}
          rightSlot={<MockTimer expiresAt={expiresAt} onTimeUp={handleTimeUp} />}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <QuestionView
            type={qType}
            content={current.content}
            imageUrl={current.imageUrl}
            options={current.options}
            value={
              isAnswered
                ? answerToValueArray(answeredMap.get(current.id)!)
                : selected
            }
            onChange={isAnswered ? () => {} : setSelected}
            disabled={isAnswered}
            // 模考不显示反馈：始终传 null，且不渲染 AnswerFeedback。
            feedback={null}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {!isAnswered ? (
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {pending ? '提交中...' : '提交答案'}
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={isLastQuestion || pending}>
              下一题
            </Button>
          )}
        </div>
        <Button
          variant="default"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
        >
          交卷
        </Button>
      </div>

      <SubmitConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        unansweredCount={unansweredCount}
        onConfirm={() => {
          setConfirmOpen(false);
          handleSubmitExam();
        }}
        pending={pending}
      />
    </div>
  );
}
