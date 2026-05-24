/**
 * AnswerFeedback 答题反馈组件。
 *
 * 在练习模式（顺序 / 随机 / 章节 / 错题重做）下，于学员提交答案后立即展示：
 *   - 对错状态（绿色✓ / 红色✗）
 *   - 答错时同时显示"你的答案"与"正确答案"，方便学员对照差异
 *   - 题目解析（如有）
 *
 * 模考模式下父组件不渲染本组件（不需要在本组件做模式判断）。
 *
 * @see Requirements 7.2, 7.3, 7.4
 */
'use client';

import { cn } from '@/lib/utils';

interface AnswerFeedbackProps {
  isCorrect: boolean;
  userAnswer: string;
  correctAnswer: string;
  explanation?: string | null;
}

export function AnswerFeedback({ isCorrect, userAnswer, correctAnswer, explanation }: AnswerFeedbackProps) {
  return (
    <div
      className={cn(
        'rounded-md border p-4 mt-4',
        isCorrect ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50',
      )}
    >
      <div className={cn('font-semibold mb-2', isCorrect ? 'text-green-700' : 'text-red-700')}>
        {isCorrect ? '✓ 回答正确' : '✗ 回答错误'}
      </div>
      {!isCorrect && (
        <div className="text-sm text-gray-700">
          <div>
            你的答案：<span className="font-mono">{userAnswer || '(未作答)'}</span>
          </div>
          <div>
            正确答案：<span className="font-mono">{correctAnswer}</span>
          </div>
        </div>
      )}
      {explanation && (
        <div className="mt-2 text-sm text-gray-600">
          <div className="font-semibold">解析：</div>
          <div className="whitespace-pre-wrap">{explanation}</div>
        </div>
      )}
    </div>
  );
}
