'use client';

/**
 * QuestionView —— 答题界面的题目展示与答题控件组件。
 *
 * 单列布局：题干 → 图片（可选）→ 选项；窄屏占满，宽屏 `max-w-[720px] mx-auto`。
 *
 * 题型适配：
 * - SINGLE：自定义 div + 状态切换（视觉上类似 radio），同一时间只能选中 1 项；
 *   选第二项时自动取消第一项。
 * - MULTI：使用 `@/components/ui/checkbox` 提供独立切换的多选项。
 * - JUDGE：渲染"正确 / 错误"两个互斥按钮（Button variant 切换），`options` 留空，
 *   `value` 取 `['T']` 或 `['F']`。
 *
 * 受控接口：父组件通过 `value` / `onChange` 控制已选项；通过 `feedback`（提交后）
 * 控制是否显示对错反馈与高亮（绿色 = 正确答案；红色 = 用户错选）。
 *
 * 图片加载使用原生 `<img>` 标签 + `onError` 回退到占位 SVG，加载失败不阻断答题。
 */

import { Check, ImageOff, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { QuestionOption, QuestionType } from '@/lib/question-types';
import { cn } from '@/lib/utils';

export interface QuestionViewFeedback {
  /** 题目正确答案，已规范化（如 "A"、"AC"、"T"、"F"） */
  correctAnswer: string;
  /** 用户提交的答案，已规范化 */
  userAnswer: string;
}

export interface QuestionViewProps {
  type: QuestionType;
  content: string;
  imageUrl?: string | null;
  /** SINGLE / MULTI 题的选项列表；JUDGE 题应留空数组 */
  options: QuestionOption[];
  /** 已选选项 key 数组；JUDGE 用 ['T'] 或 ['F'] */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** 显示反馈时高亮正确/错误的选项；为 null/undefined 表示尚未提交 */
  feedback?: QuestionViewFeedback | null;
}

/** 把答案串拆成 key 集合（统一大写、去空白）。 */
function answerKeySet(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .toUpperCase()
      .split('')
      .filter((ch) => ch.trim().length > 0),
  );
}

/**
 * 根据反馈状态计算选项的视觉状态：
 * - 'correct'：绿色（正确答案）
 * - 'wrong'：红色（用户选错的项）
 * - 'neutral'：未提交或与本选项无关
 */
function getFeedbackState(
  optionKey: string,
  feedback: QuestionViewFeedback | null | undefined,
): 'correct' | 'wrong' | 'neutral' {
  if (!feedback) return 'neutral';
  const correct = answerKeySet(feedback.correctAnswer);
  const user = answerKeySet(feedback.userAnswer);
  if (correct.has(optionKey)) return 'correct';
  if (user.has(optionKey)) return 'wrong';
  return 'neutral';
}

/** 选项卡片基础样式，根据是否选中 / 反馈状态切换边框与背景。 */
function optionClasses(args: {
  selected: boolean;
  state: 'correct' | 'wrong' | 'neutral';
  disabled: boolean;
}): string {
  const { selected, state, disabled } = args;
  return cn(
    'flex items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors',
    'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
    !disabled && 'cursor-pointer hover:bg-accent/50',
    disabled && 'cursor-not-allowed opacity-90',
    state === 'neutral' && selected && 'border-primary bg-primary/5',
    state === 'neutral' && !selected && 'border-input bg-background',
    state === 'correct' && 'border-green-600 bg-green-50 text-green-900',
    state === 'wrong' && 'border-red-600 bg-red-50 text-red-900',
  );
}

/** 选项左侧的圆形 key 徽标，体现选中 / 正确 / 错误三态。 */
function OptionBadge({
  optionKey,
  selected,
  state,
}: {
  optionKey: string;
  selected: boolean;
  state: 'correct' | 'wrong' | 'neutral';
}) {
  return (
    <span
      className={cn(
        'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
        state === 'neutral' && selected && 'border-primary bg-primary text-primary-foreground',
        state === 'neutral' && !selected && 'border-input bg-background text-foreground',
        state === 'correct' && 'border-green-600 bg-green-600 text-white',
        state === 'wrong' && 'border-red-600 bg-red-600 text-white',
      )}
      aria-hidden
    >
      {state === 'correct' ? (
        <Check className="h-3.5 w-3.5" />
      ) : state === 'wrong' ? (
        <X className="h-3.5 w-3.5" />
      ) : (
        optionKey
      )}
    </span>
  );
}

/** 加载失败时的占位图块。 */
function ImagePlaceholder() {
  return (
    <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted text-muted-foreground">
      <ImageOff className="h-6 w-6" />
      <span className="text-xs">图片加载失败</span>
    </div>
  );
}

/** 题目图片：使用原生 <img>，加载失败时切换到占位块。 */
function QuestionImage({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) return <ImagePlaceholder />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className="max-h-72 w-full rounded-md border bg-background object-contain"
    />
  );
}

export function QuestionView({
  type,
  content,
  imageUrl,
  options,
  value,
  onChange,
  disabled = false,
  feedback = null,
}: QuestionViewProps) {
  const isReadOnly = disabled || feedback !== null;

  function handleSingleSelect(optionKey: string) {
    if (isReadOnly) return;
    // SINGLE：选第二项自动取消第一项 —— 直接覆盖为单元素数组。
    onChange([optionKey]);
  }

  function handleMultiToggle(optionKey: string, checked: boolean) {
    if (isReadOnly) return;
    if (checked) {
      if (value.includes(optionKey)) return;
      // 保持升序，便于上层比较与展示
      onChange([...value, optionKey].sort());
    } else {
      onChange(value.filter((k) => k !== optionKey));
    }
  }

  function handleJudgeSelect(judgeValue: 'T' | 'F') {
    if (isReadOnly) return;
    onChange([judgeValue]);
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4">
      {/* 题干 */}
      <div className="whitespace-pre-wrap text-base leading-relaxed">{content}</div>

      {/* 图片（可选） */}
      {imageUrl ? <QuestionImage src={imageUrl} alt="题目配图" /> : null}

      {/* 选项区 */}
      {type === 'JUDGE' ? (
        <JudgeChoices
          value={value}
          feedback={feedback}
          disabled={isReadOnly}
          onSelect={handleJudgeSelect}
        />
      ) : type === 'MULTI' ? (
        <MultiChoices
          options={options}
          value={value}
          feedback={feedback}
          disabled={isReadOnly}
          onToggle={handleMultiToggle}
        />
      ) : (
        <SingleChoices
          options={options}
          value={value}
          feedback={feedback}
          disabled={isReadOnly}
          onSelect={handleSingleSelect}
        />
      )}
    </div>
  );
}

/* ----------------------------- 题型子视图 ----------------------------- */

function SingleChoices({
  options,
  value,
  feedback,
  disabled,
  onSelect,
}: {
  options: QuestionOption[];
  value: string[];
  feedback: QuestionViewFeedback | null;
  disabled: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2" role="radiogroup" aria-label="单选题选项">
      {options.map((opt) => {
        const selected = value.includes(opt.key);
        const state = getFeedbackState(opt.key, feedback);
        return (
          <li key={opt.key}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onSelect(opt.key)}
              className={cn(optionClasses({ selected, state, disabled }), 'w-full')}
            >
              <OptionBadge optionKey={opt.key} selected={selected} state={state} />
              <span className="flex-1 whitespace-pre-wrap break-words leading-relaxed">
                {opt.text}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MultiChoices({
  options,
  value,
  feedback,
  disabled,
  onToggle,
}: {
  options: QuestionOption[];
  value: string[];
  feedback: QuestionViewFeedback | null;
  disabled: boolean;
  onToggle: (key: string, checked: boolean) => void;
}) {
  return (
    <ul className="flex flex-col gap-2" aria-label="多选题选项">
      {options.map((opt) => {
        const selected = value.includes(opt.key);
        const state = getFeedbackState(opt.key, feedback);
        const checkboxId = `q-opt-${opt.key}`;
        return (
          <li key={opt.key}>
            <label
              htmlFor={checkboxId}
              className={cn(optionClasses({ selected, state, disabled }), 'w-full')}
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                <Checkbox
                  id={checkboxId}
                  checked={selected}
                  disabled={disabled}
                  onCheckedChange={(checked) => onToggle(opt.key, checked === true)}
                />
              </span>
              <span
                className={cn(
                  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  state === 'neutral' && 'border-input bg-background text-foreground',
                  state === 'correct' && 'border-green-600 bg-green-600 text-white',
                  state === 'wrong' && 'border-red-600 bg-red-600 text-white',
                )}
                aria-hidden
              >
                {opt.key}
              </span>
              <span className="flex-1 whitespace-pre-wrap break-words leading-relaxed">
                {opt.text}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function JudgeChoices({
  value,
  feedback,
  disabled,
  onSelect,
}: {
  value: string[];
  feedback: QuestionViewFeedback | null;
  disabled: boolean;
  onSelect: (judgeValue: 'T' | 'F') => void;
}) {
  const items: { key: 'T' | 'F'; label: string }[] = [
    { key: 'T', label: '正确' },
    { key: 'F', label: '错误' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="判断题选项">
      {items.map((item) => {
        const selected = value.includes(item.key);
        const state = getFeedbackState(item.key, feedback);
        // 反馈状态用绿色/红色覆盖；未提交时用 default/outline 区分选中
        const variant: 'default' | 'outline' = selected ? 'default' : 'outline';
        return (
          <Button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={selected}
            variant={variant}
            disabled={disabled}
            onClick={() => onSelect(item.key)}
            className={cn(
              'h-12 text-base',
              state === 'correct' &&
                'border-green-600 bg-green-600 text-white hover:bg-green-600/90',
              state === 'wrong' && 'border-red-600 bg-red-600 text-white hover:bg-red-600/90',
            )}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
