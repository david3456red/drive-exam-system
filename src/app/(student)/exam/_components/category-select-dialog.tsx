/**
 * CategorySelectDialog 章节多选对话框。
 *
 * 在"章节练习"模式下，由 `/exam` 页面的题库卡片触发：弹出对话框，
 * 让学员从该题库下挂载的分类树中勾选一个或多个章节，然后点"开始练习"
 * 进入 `startSession` 流程。
 *
 * 主要约束：
 *   - 至少选择 1 个分类才能点击"开始练习"按钮（按钮在 `selected.size === 0` 时禁用）。
 *   - 父子分类同列表渲染（按 `parentId` 还原层级、用 `padding-left` 体现缩进）；
 *     选中父分类不会自动选中子分类——服务端 `startSession` 会按
 *     `descendantsOf(categoryIds)` 递归展开（详见设计 §Property 4）。
 *   - `pending` 表示提交中（`startSession` 进行中），此时禁用按钮防止重复点击。
 *
 * 由于项目内未封装 shadcn/ui Dialog，本组件直接使用 `@radix-ui/react-dialog`。
 *
 * @see Requirements 1.2, 4.1
 */
'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useState } from 'react';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  /** 该分类下的题目数（可选，展示用） */
  questionCount?: number;
}

interface CategorySelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 扁平化数组，组件内部按 parentId 还原层级 */
  categories: Category[];
  onConfirm: (selectedIds: string[]) => void;
  pending?: boolean;
}

export function CategorySelectDialog({
  open,
  onOpenChange,
  categories,
  onConfirm,
  pending,
}: CategorySelectDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 把扁平数组按 parentId 组织成树
  const roots = categories.filter((c) => c.parentId === null);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);

  function renderTree(node: Category, depth: number): React.ReactNode {
    const children = childrenOf(node.id);
    return (
      <div key={node.id}>
        <label
          className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 px-2 rounded"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <Checkbox
            checked={selected.has(node.id)}
            onCheckedChange={() => toggle(node.id)}
          />
          <span>{node.name}</span>
          {typeof node.questionCount === 'number' && (
            <span className="text-xs text-gray-500">({node.questionCount} 题)</span>
          )}
        </label>
        {children.map((c) => renderTree(c, depth + 1))}
      </div>
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl max-h-[80vh] flex flex-col">
          <DialogPrimitive.Title className="text-lg font-semibold mb-2">
            选择章节
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-gray-600 mb-4">
            勾选要练习的章节，可多选。选中父分类时同时包含其子分类。
          </DialogPrimitive.Description>
          <div className="flex-1 overflow-y-auto border rounded p-2 mb-4">
            {roots.length === 0 ? (
              <div className="text-center text-gray-500 py-8">暂无分类</div>
            ) : (
              roots.map((root) => renderTree(root, 0))
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">已选 {selected.size} 个</span>
            <div className="flex gap-2">
              <DialogPrimitive.Close asChild>
                <Button variant="outline" disabled={pending}>
                  取消
                </Button>
              </DialogPrimitive.Close>
              <Button
                onClick={() => onConfirm(Array.from(selected))}
                disabled={pending || selected.size === 0}
              >
                {pending ? '加载中...' : '开始练习'}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
