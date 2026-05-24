'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createCategory, updateCategory, deleteCategory } from './category-actions';

type CategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  questionCount: number;
};

export function CategorySection({
  bankId,
  initial,
  canCreate,
  canUpdate,
  canDelete,
}: {
  bankId: string;
  initial: CategoryRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  function onAdd() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const res = await createCategory({ bankId, name: newName.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('已添加');
      setNewName('');
      setShowAdd(false);
      router.refresh();
    });
  }

  function onSaveEdit(id: string) {
    if (!editingName.trim()) return;
    startTransition(async () => {
      const res = await updateCategory({ id, name: editingName.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('已保存');
      setEditingId(null);
      router.refresh();
    });
  }

  function onDelete(row: CategoryRow) {
    const msg =
      row.questionCount > 0
        ? `分类 "${row.name}" 已被 ${row.questionCount} 道题引用,删除后题目不会消失但会移出该分类。确认?`
        : `确认删除分类 "${row.name}"?`;
    if (!window.confirm(msg)) return;
    startTransition(async () => {
      const res = await deleteCategory(row.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('已删除');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>自定义分类</span>
          {canCreate && !showAdd && (
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} disabled={pending}>
              <Plus className="h-3.5 w-3.5 mr-1" /> 新增
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {showAdd && (
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="分类名称,例如 交通信号"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={pending}
              autoFocus
            />
            <Button size="sm" onClick={onAdd} disabled={pending || !newName.trim()}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowAdd(false);
                setNewName('');
              }}
              disabled={pending}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {initial.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            暂无分类。导入题目时未存在的分类会自动创建。
          </p>
        ) : (
          <ul className="divide-y border rounded-md">
            {initial.map((row) => (
              <li key={row.id} className="flex items-center gap-2 p-3">
                {editingId === row.id ? (
                  <>
                    <Input
                      className="flex-1"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      disabled={pending}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => onSaveEdit(row.id)}
                      disabled={pending || !editingName.trim()}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={pending}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{row.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {row.questionCount} 题
                    </span>
                    {canUpdate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(row.id);
                          setEditingName(row.name);
                        }}
                        disabled={pending}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="ghost" onClick={() => onDelete(row)} disabled={pending}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
