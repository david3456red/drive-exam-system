'use client';

/**
 * PracticePlayer —— 顺序 / 章节 / 错题重做模式共用的练习答题播放器。
 *
 * 与设计文档 §Components 的"PracticePlayer"约定保持一致:
 *
 * - 顺序展示题目,支持「上一题」/「下一题」导航;
 * - 学员选答后点「提交答案」立即调用 `submitAnswer` Server Action,
 *   并在当前题目下方渲染 `AnswerFeedback`(对错 + 正确答案 + 解析);
 * - 提交后允许停留查看反馈,再点「下一题」前进;
 * - 提交答完最后一题(`submitAnswer` 返回 `finished: true`)时,
 *   自动调用 `finishSession` 并跳转到结果页;
 * - 「上一题」导航回看历史已答记录时,以只读形式展示用户答案与对错;
 *   反馈中的「正确答案 / 解析」仅对本次会话内新提交的题目可见
 *   (因为 Server Component 加载历史 `ExamRecord` 时未携带这两个字段)。
 *
 * 所有写动作通过 `useTransition` 标记 pending,避免重复点击;
 * 错误统一用 `sonner.toast.error` 反馈,不抛出异常打断 React 渲染
 * (与项目其它 Server Action 调用方一致)。
 *
 * @see Requirements 2.1, 2.2, 2.3, 4.2, 6.1, 6.2, 6.3, 6.4, 7.2, 7.3
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ExamMode } from '@/lib/exam-engine/types';
import type { QuestionOption, QuestionType } from '@/lib/question-types';

import { AnswerFeedback } from '@/app/(student)/exam/_components/answer-feedback';
import { ProgressBar } from '@/app/(student)/exam/_components/progress-bar';
import { QuestionView } from '@/app/(student)/exam/_components/question-view';
import {
    abandonSession,
    finishSession,
    submitAnswer,
} from '@/app/(student)/exam/actions';

interface QuestionData {
  id: string;
  /** Prisma 中存的是 string;父组件直接透传,这里再 cast 成 QuestionType。 */
  type: string;
  content: string;
  imageUrl: string | null;
  options: QuestionOption[];
}

interface ExistingRecord {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
}

/** 单题在客户端的"已答"状态;`correctAnswer` / `explanation` 仅本次会话提交后填充。 */
interface LocalRecord {
  userAnswer: string;
  isCorrect: boolean;
  correctAnswer?: string;
  explanation?: string | null;
}

interface PracticePlayerProps {
  attemptId: string;
  /** 由父组件传入,只可能取 SEQUENTIAL / CHAPTER / WRONG_REVIEW 之一。 */
  mode: ExamMode;
  questions: QuestionData[];
  /** 来自 `ExamAttempt.currentIndex`,用于断点续答;越界时钳制到最后一题。 */
  initialIndex: number;
  /** 已存在的 `ExamRecord`,用于恢复"已答"标记与上一题回看。 */
  initialRecords: ExistingRecord[];
}

/**
 * 把规范化后的 userAnswer 字符串拆回 `QuestionView` 需要的选项数组。
 * 单选 / 判断 → 单字母数组(如 'A' → ['A']、'T' → ['T']);
 * 多选 → 字母数组(如 'AC' → ['A', 'C']),与 MULTI 规范化后的存储一致。
 */
function answerToValueArray(answer: string): string[] {
  return answer.split('').filter((c) => c.trim().length > 0);
}

export function PracticePlayer({
  attemptId,
  mode,
  questions,
  initialIndex,
  initialRecords,
}: PracticePlayerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 当前题号,钳制到合法范围以兼容"快照题被删"等异常情形。
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(questions.length - 1, 0)),
  );

  // 已答记录:初始来自 DB,本次会话每次 submit 后追加。
  // 用 Map 便于 O(1) 按 questionId 取记录;状态更新时 new 一个新 Map 触发重渲染。
  const [records, setRecords] = useState<Map<string, LocalRecord>>(() => {
    const m = new Map<string, LocalRecord>();
    for (const r of initialRecords) {
      m.set(r.questionId, { userAnswer: r.userAnswer, isCorrect: r.isCorrect });
    }
    return m;
  });

  // 当前题已选选项;切题时清空,已答题不允许重新选择。
  const [selected, setSelected] = useState<string[]>([]);

  // 答题开始时间戳,用于计算 `costMs`。
  // 注意:为简化实现,使用整个组件的挂载时间作为基线;每次切到新题时
  // 通过 `goNext` / `goPrev` 重置即可。
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());

  const current = questions[index];
  const currentRecord = records.get(current.id);
  const isAnswered = !!currentRecord;

  const qType = current.type as QuestionType;
  // 提交按钮可用条件(对应 §Property 11):
  //   SINGLE / JUDGE: 已选 1 项;
  //   MULTI: 已选 ≥ 2 项。
  const canSubmit =
    !isAnswered &&
    !pending &&
    (qType === 'MULTI' ? selected.length >= 2 : selected.length === 1);

  const isFirstQuestion = index === 0;
  const isLastQuestion = index === questions.length - 1;
  const allAnswered = records.size === questions.length;

  /** 提交当前题答案。成功后写入本地 records;答完最后一题自动结束并跳转。 */
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
        return;
      }

      // 1. 把本次反馈写进本地记录
      const newRecord: LocalRecord = {
        userAnswer,
        isCorrect: res.data.isCorrect,
        correctAnswer: res.data.correctAnswer,
        explanation: res.data.explanation,
      };
      setRecords((prev) => {
        const next = new Map(prev);
        next.set(current.id, newRecord);
        return next;
      });

      // 2. 答完最后一题:服务端会通过 `finished: true` 通知;本地 records
      //    在本次更新之后会增加 1,因此这里用 `records.size + 1` 兜底判断。
      const finishedNow =
        res.data.finished || records.size + 1 === questions.length;
      if (finishedNow) {
        const finishRes = await finishSession(attemptId);
        if (!finishRes.ok) {
          toast.error(finishRes.error);
          return;
        }
        router.push(`/exam/session/${attemptId}/result`);
      }
    });
  }

  /** 前进到下一题;清空选择并重置耗时基线。 */
  function goNext() {
    if (isLastQuestion) return;
    setIndex(index + 1);
    setSelected([]);
    setStartedAtMs(Date.now());
  }

  /** 回看上一题;选择被清空(因为上一题已答时为只读)。 */
  function goPrev() {
    if (isFirstQuestion) return;
    setIndex(index - 1);
    setSelected([]);
    setStartedAtMs(Date.now());
  }

  /** 用户主动结束本次练习。会通过浏览器原生 `confirm` 二次确认。 */
  function handleFinish() {
    if (typeof window !== 'undefined' && !window.confirm('确定结束本次练习?未答题目不计分。')) {
      return;
    }
    startTransition(async () => {
      const res = await finishSession(attemptId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(`/exam/session/${attemptId}/result`);
    });
  }

  /** 用户主动放弃本次练习。返回 `/exam`,会话被标记为 ABANDONED。 */
  function handleAbandon() {
    if (typeof window !== 'undefined' && !window.confirm('确定放弃本次练习?进度将被标记为已放弃。')) {
      return;
    }
    startTransition(async () => {
      const res = await abandonSession(attemptId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push('/exam');
    });
  }

  // 已答题 + 含 correctAnswer(本次会话刚提交)时,渲染选项高亮反馈;
  // 上一题回看(仅本地仅有 userAnswer/isCorrect)时,QuestionView 仅置只读。
  const feedbackForView =
    isAnswered && currentRecord?.correctAnswer
      ? {
          correctAnswer: currentRecord.correctAnswer,
          userAnswer: currentRecord.userAnswer,
        }
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ProgressBar mode={mode} current={index + 1} total={questions.length} />

      <Card>
        <CardContent className="pt-6">
          <QuestionView
            type={qType}
            content={current.content}
            imageUrl={current.imageUrl}
            options={current.options}
            value={
              isAnswered
                ? answerToValueArray(currentRecord!.userAnswer)
                : selected
            }
            onChange={isAnswered ? () => {} : setSelected}
            disabled={isAnswered}
            feedback={feedbackForView}
          />

          {isAnswered && currentRecord!.correctAnswer && (
            <AnswerFeedback
              isCorrect={currentRecord!.isCorrect}
              userAnswer={currentRecord!.userAnswer}
              correctAnswer={currentRecord!.correctAnswer}
              explanation={currentRecord!.explanation}
            />
          )}
        </CardContent>
      </Card>

      {/* 操作按钮区:左侧导航/提交,右侧结束/放弃 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={goPrev}
            disabled={isFirstQuestion || pending}
          >
            上一题
          </Button>
          {!isAnswered ? (
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {pending ? '提交中...' : '提交答案'}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={isLastQuestion || pending}>
              下一题
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {allAnswered && (
            <Button variant="default" onClick={handleFinish} disabled={pending}>
              结束练习
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAbandon}
            disabled={pending}
          >
            放弃
          </Button>
        </div>
      </div>
    </div>
  );
}
