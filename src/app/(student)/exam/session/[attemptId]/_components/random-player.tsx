/**
 * RandomPlayer —— 随机模式专用答题客户端组件。
 *
 * 与 `PracticePlayer` 的关键区别:
 *
 * - **禁用"上一题"按钮**:随机模式只能从已答题前进,不能回看已答题目
 *   (对应需求 3.4)。本组件因此完全去掉"上一题"按钮,仅保留"提交答案"
 *   与"下一题"两类前进动作。
 * - **进度文案使用"已答 N/M 题"**:`ProgressBar` 的 `mode` 属性传 `RANDOM`
 *   会自动渲染该文案(对应需求 3.3)。当前进度以 `records.size` 为分子,
 *   `questions.length` 为分母——这与"会话内不重复出题、答完最后一题
 *   即结束"的语义一致(对应需求 3.2 / 3.5)。
 * - **答完最后一题自动结束并跳结果页**:本组件检测两种"答完"信号:
 *   1) 服务端 `submitAnswer` 返回 `finished: true`(由
 *      `ExamAttempt.currentIndex` 推进到 `questionOrder.length` 触发);
 *   2) 客户端 `records.size + 1 === questions.length`(乐观判定,作为
 *      网络抖动时的兜底)。任一信号触发后调用 `finishSession` 把会话
 *      结算为 `FINISHED` 并 `router.push` 到 `/exam/session/[attemptId]/result`。
 *
 * 受控接口(由 Server Component `page.tsx` 注入):
 *
 * - `attemptId`:当前 `ExamAttempt.id`,用于所有 Server Action 调用;
 * - `questions`:按 `questionOrder` 重排后的题目数组(`page.tsx` 已保证顺序);
 * - `initialIndex`:服务端 `currentIndex` 快照,用于断点续答(对应需求 3.5);
 * - `initialRecords`:已存在的 `ExamRecord` 用于"已答"标记(随机模式不会
 *   实际渲染已答题目的反馈,但保留映射以便统计已答数与禁用提交按钮)。
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { AnswerFeedback } from '@/app/(student)/exam/_components/answer-feedback';
import { ProgressBar } from '@/app/(student)/exam/_components/progress-bar';
import { QuestionView } from '@/app/(student)/exam/_components/question-view';
import { abandonSession, finishSession, submitAnswer } from '@/app/(student)/exam/actions';
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
  isCorrect: boolean;
}

interface RandomPlayerProps {
  attemptId: string;
  questions: QuestionData[];
  initialIndex: number;
  initialRecords: ExistingRecord[];
}

interface RecordEntry {
  userAnswer: string;
  isCorrect: boolean;
  correctAnswer?: string;
  explanation?: string | null;
}

export function RandomPlayer({ attemptId, questions, initialIndex, initialRecords }: RandomPlayerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [index, setIndex] = useState(Math.min(initialIndex, questions.length - 1));
  const [records, setRecords] = useState<Map<string, RecordEntry>>(() => {
    const m = new Map<string, RecordEntry>();
    initialRecords.forEach((r) => m.set(r.questionId, { userAnswer: r.userAnswer, isCorrect: r.isCorrect }));
    return m;
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [startedAtMs] = useState(() => Date.now());

  const current = questions[index];
  const currentRecord = records.get(current.id);
  const isAnswered = !!currentRecord;

  const qType = current.type as QuestionType;
  const canSubmit =
    !isAnswered &&
    !pending &&
    (qType === 'MULTI' ? selected.length >= 2 : selected.length === 1);

  const isLastQuestion = index === questions.length - 1;

  function handleSubmit() {
    const userAnswer = qType === 'MULTI' ? [...selected].sort().join('') : selected.join('');
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
      setRecords((prev) =>
        new Map(prev).set(current.id, {
          userAnswer,
          isCorrect: res.data.isCorrect,
          correctAnswer: res.data.correctAnswer,
          explanation: res.data.explanation,
        }),
      );

      if (res.data.finished || records.size + 1 === questions.length) {
        const finishRes = await finishSession(attemptId);
        if (!finishRes.ok) {
          toast.error(finishRes.error);
          return;
        }
        router.push(`/exam/session/${attemptId}/result`);
      }
    });
  }

  function goNext() {
    if (isLastQuestion) return;
    setIndex(index + 1);
    setSelected([]);
  }

  function handleAbandon() {
    if (!window.confirm('确定放弃本次练习?')) return;
    startTransition(async () => {
      const res = await abandonSession(attemptId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push('/exam');
    });
  }

  function answerToValueArray(answer: string): string[] {
    return answer.split('').filter((c) => c.trim().length > 0);
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <ProgressBar mode="RANDOM" current={records.size} total={questions.length} />

      <Card>
        <CardContent className="pt-6">
          <QuestionView
            type={qType}
            content={current.content}
            imageUrl={current.imageUrl}
            options={current.options}
            value={isAnswered ? answerToValueArray(currentRecord!.userAnswer) : selected}
            onChange={isAnswered ? () => {} : setSelected}
            disabled={isAnswered}
            feedback={
              isAnswered && currentRecord!.correctAnswer
                ? {
                    correctAnswer: currentRecord!.correctAnswer,
                    userAnswer: currentRecord!.userAnswer,
                  }
                : null
            }
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

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div>
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
        <Button variant="ghost" size="sm" onClick={handleAbandon} disabled={pending}>
          放弃
        </Button>
      </div>
    </div>
  );
}
