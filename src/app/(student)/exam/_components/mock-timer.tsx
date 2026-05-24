/**
 * 模考倒计时组件 `MockTimer`
 *
 * 模拟考试模式专用，按 1 秒间隔实时刷新剩余时间显示。
 *
 * 设计要点：
 *
 * - 仅基于 `expiresAt` 推算剩余毫秒数：`remainingMs = max(0, expiresAt - Date.now())`，
 *   不依赖客户端时钟绝对值，避免本地时间被改导致提前/延后归零。
 * - 倒计时归零时调用 `onTimeUp` 回调，由父组件触发 `finishSession`；
 *   通过 `useRef` 标记保证整个组件生命周期内 `onTimeUp` 至多只触发一次，
 *   避免每秒 tick 重复触发。
 * - 剩余 5 分钟内字体变红加粗作为视觉提醒。
 *
 * 该组件为纯展示组件，不持有业务状态。
 */

'use client';

import { useEffect, useRef, useState } from 'react';

interface MockTimerProps {
  /** 模考截止时间，由服务端在创建会话时写入 ExamAttempt.expiresAt */
  expiresAt: Date | string;
  /** 倒计时归零时触发，整个组件生命周期内至多调用一次 */
  onTimeUp: () => void;
}

/** 把毫秒数格式化为 mm:ss，负值或 0 统一显示 00:00 */
function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function MockTimer({ expiresAt, onTimeUp }: MockTimerProps) {
  const expiresMs =
    typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt.getTime();

  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, expiresMs - Date.now()));

  // 用 ref 确保 onTimeUp 在归零时只被调用一次，避免每秒 tick 重复触发
  const firedRef = useRef(false);

  useEffect(() => {
    // 切换 expiresAt（理论上不会发生）时重置触发标记
    firedRef.current = false;

    const tick = () => {
      const next = Math.max(0, expiresMs - Date.now());
      setRemainingMs(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        onTimeUp();
      }
    };

    tick(); // 立即同步一次，避免首次渲染与下一次 setInterval 之间的 1 秒空档
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresMs, onTimeUp]);

  // 剩余 5 分钟内变红加粗
  const isWarning = remainingMs > 0 && remainingMs <= 5 * 60 * 1000;

  return (
    <span
      className={`font-mono text-base ${
        isWarning ? 'text-red-600 font-bold' : 'text-gray-700'
      }`}
    >
      ⏱ 剩余 {formatRemaining(remainingMs)}
    </span>
  );
}
