/**
 * 答题进度条组件 `ProgressBar`
 *
 * 在答题界面顶部展示当前答题进度，根据所处的答题模式呈现不同文案：
 *
 * - 顺序 / 章节 / 错题重做 / 模考：「第 N/M 题」
 * - 随机：「已答 N/M 题」
 *
 * 同时提供一个 `rightSlot` 插槽，用于模考模式插入 `MockTimer` 倒计时；
 * 进度条本身按 `current/total` 百分比渲染，保留两位以内的整数百分比。
 *
 * 该组件为纯展示组件，不持有任何状态，所有数据由父组件传入。
 */

'use client';

import type { ExamMode } from '@/lib/exam-engine/types';

interface ProgressBarProps {
  mode: ExamMode;
  /** 1-based 当前题号 */
  current: number;
  total: number;
  /** 模考模式下的额外右侧插槽（一般传入 MockTimer） */
  rightSlot?: React.ReactNode;
}

export function ProgressBar({ mode, current, total, rightSlot }: ProgressBarProps) {
  // 顺序/章节/错题重做/模考：第 N/M 题
  // 随机：已答 N/M 题
  const text = mode === 'RANDOM' ? `已答 ${current}/${total} 题` : `第 ${current}/${total} 题`;

  const percent = total === 0 ? 0 : Math.round((current / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{text}</span>
        {rightSlot}
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
