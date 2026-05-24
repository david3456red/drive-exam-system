'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SelectNative } from '@/components/ui/select-native';
import { Card, CardContent } from '@/components/ui/card';
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from './category-actions';

export type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
  questionCount: number;
  childCount: number;
};

export function CategoriesClient({
  rows,
  canCreate,
  canUpdate,
  canDelete,
}: {
  rows: CategoryRow[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string>('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingParentId, setEditingParentId] = useState<string>('');

  const topLevel = rows.filter((r) => !r.parentId);

  function onAdd() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const res = await createCategory({
        name: newName.trim(),
        parentId: newParentId || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('已添加');
      setNewName('');
      setNewParentId('');
      setShowAdd(false);
      router.refresh();
    });
  }

  function onSaveEdit(id: string) {
    if (!editingName.trim()) return;
    startTransition(async () => {
      const res = await updateCategory({
        id,
        name: editingName.trim(),
        parentId: editingParentId || null,
      });
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
    const parts: string[] = [];
    if (row.questionCount > 0)
      parts.push(`已被 ${row.questionCount} 道题引用,删除后题目保留但失去该分类`);
    if (row.childCount > 0)
      parts.push(`存在 ${row.childCount} 个子分类(必须先删除子分类)`);
    const tail = parts.length ? `\n\n${parts.join('\n')}` : '';
    if (!window.confirm(`确认删除分类 "${row.name}"?${tail}`)) return;

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
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            分类是<strong className="text-foreground">全局共享</strong>的:同名分类可以挂载在任意题库的题目下,无需为每个题库重复创建。
          </p>
          {canCreate && !showAdd && (
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} disabled={pending}>
              <Plus className="h-3.5 w-3.5 mr-1" /> 新增
            </Button>
          )}
        </div>

        {showAdd && (
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto] items-end p-3 border rounded-md bg-muted/30">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">名称</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例如 交通信号"
                disabled={pending}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">父分类(可选)</label>
              <SelectNative
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                disabled={pending}
              >
                <option value="">(顶层)</option>
                {topLevel.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectNative>
            </div>
            <Button size="sm" onClick={onAdd} disabled={pending || !newName.trim()}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowAdd(false);
                setNewName('');
                setNewParentId('');
              }}
              disabled={pending}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            还没有分类。导入题目时,JSON / Excel 中未存在的分类会自动创建。也可以点上面的 &quot;新增&quot; 手动建立。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">分类名</th>
                  <th className="py-2 pr-3">父分类</th>
                  <th className="py-2 pr-3 w-24">题目数</th>
                  <th className="py-2 pr-3 w-24">子分类</th>
                  <th className="py-2 pr-3 w-32">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0 align-middle">
                    {editingId === row.id ? (
                      <>
                        <td className="py-2 pr-3">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            disabled={pending}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <SelectNative
                            value={editingParentId}
                            onChange={(e) => setEditingParentId(e.target.value)}
                            disabled={pending}
                          >
                            <option value="">(顶层)</option>
                            {topLevel
                              .filter((p) => p.id !== row.id)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </SelectNative>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{row.questionCount}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{row.childCount}</td>
                        <td className="py-2 pr-3">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => onSaveEdit(row.id)}
                              disabled={pending || !editingName.trim()}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                              disabled={pending}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-3 font-medium">{row.name}</td>
                        <td className="py-2 pr-3">
                          {row.parentName ? (
                            <Badge variant="muted">{row.parentName}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">(顶层)</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">{row.questionCount}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{row.childCount}</td>
                        <td className="py-2 pr-3">
                          <div className="flex gap-1">
                            {canUpdate && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingId(row.id);
                                  setEditingName(row.name);
                                  setEditingParentId(row.parentId ?? '');
                                }}
                                disabled={pending}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onDelete(row)}
                                disabled={pending}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
