/**
 * 模考交卷确认对话框组件 `SubmitConfirmDialog`
 *
 * 在模拟考试模式下，学员点击「交卷」按钮后弹出二次确认对话框：
 *
 * - 当存在未作答题目时，以警告色显示未答题数，并提示「未答题将计为错误」。
 * - 当所有题目都已作答时，仅显示常规确认文案。
 *
 * 由于项目当前并未引入 shadcn/ui 的 dialog 包装层，这里直接基于
 * `@radix-ui/react-dialog` 构建轻量受控对话框：父组件通过 `open` /
 * `onOpenChange` 控制开关，通过 `onConfirm` 接收最终交卷动作；
 * `pending` 标记用于在 Server Action 进行中禁用按钮，避免重复提交。
 */

'use client';

import { Button } from '@/components/ui/button';
import * as DialogPrimitive from '@radix-ui/react-dialog';

interface SubmitConfirmDialogProps {
  /** 受控的对话框开关状态 */
  open: boolean;
  /** 对话框开关变化回调（关闭、点击 overlay、按 ESC 等） */
  onOpenChange: (open: boolean) => void;
  /** 当前未作答的题目数量，>0 时以警告色突出 */
  unansweredCount: number;
  /** 用户点击「确认交卷」后触发 */
  onConfirm: () => void;
  /** 提交按钮的 loading/disabled 状态，避免重复点击 */
  pending?: boolean;
}

export function SubmitConfirmDialog({
  open,
  onOpenChange,
  unansweredCount,
  onConfirm,
  pending,
}: SubmitConfirmDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl focus:outline-none">
          <DialogPrimitive.Title className="mb-2 text-lg font-semibold text-gray-900">
            确认交卷
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 text-sm text-gray-600">
            {unansweredCount > 0 ? (
              <>
                你还有 <span className="font-bold text-red-600">{unansweredCount}</span>{' '}
                道题未作答，未答题将计为错误。确认交卷吗？
              </>
            ) : (
              '所有题目已作答。确认交卷吗？'
            )}
          </DialogPrimitive.Description>
          <div className="flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button variant="outline" disabled={pending}>
                取消
              </Button>
            </DialogPrimitive.Close>
            <Button onClick={onConfirm} disabled={pending}>
              {pending ? '提交中...' : '确认交卷'}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
