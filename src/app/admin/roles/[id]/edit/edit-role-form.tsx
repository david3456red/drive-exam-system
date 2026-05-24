'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { saveRolePermissions } from '../../actions';

type PermItem = { id: string; code: string; name: string; groupName: string };
type Group = { name: string; items: PermItem[] };

export function EditRoleForm({
  roleId,
  groups,
  initialOwned,
}: {
  roleId: string;
  groups: Group[];
  initialOwned: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialOwned));

  const allCount = useMemo(() => groups.reduce((sum, g) => sum + g.items.length, 0), [groups]);

  const isSelected = (id: string) => selected.has(id);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (g: Group) => {
    const allChecked = g.items.every((p) => selected.has(p.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) g.items.forEach((p) => next.delete(p.id));
      else g.items.forEach((p) => next.add(p.id));
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(groups.flatMap((g) => g.items.map((p) => p.id))));
  const clearAll = () => setSelected(new Set());

  const dirty = useMemo(() => {
    const initSet = new Set(initialOwned);
    if (initSet.size !== selected.size) return true;
    for (const id of Array.from(selected)) if (!initSet.has(id)) return true;
    return false;
  }, [initialOwned, selected]);

  function onSubmit() {
    startTransition(async () => {
      const res = await saveRolePermissions({
        roleId,
        permissionIds: Array.from(selected),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('已保存。变更将在用户下次登录后生效。');
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription className="text-sm">
          ⚠️ 权限变更将在用户<strong>下次登录</strong>时生效(JWT 缓存了当前权限)。
          已选 <strong>{selected.size}</strong> / {allCount} 个权限。
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" variant="outline" size="sm" onClick={selectAll} disabled={pending}>
          全选
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={pending}>
          清空
        </Button>
      </div>

      <div className="space-y-4">
        {groups.map((g) => {
          const allChecked = g.items.every((p) => selected.has(p.id));
          const someChecked = g.items.some((p) => selected.has(p.id));
          return (
            <div key={g.name} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3 pb-2 border-b">
                <div className="font-semibold">{g.name}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleGroup(g)}
                  disabled={pending}
                  className="text-xs"
                >
                  {allChecked ? '取消全组' : someChecked ? '全选本组' : '全选本组'}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.items.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-start gap-2 cursor-pointer p-2 -m-2 rounded hover:bg-accent"
                  >
                    <Checkbox
                      checked={isSelected(p.id)}
                      onCheckedChange={() => toggle(p.id)}
                      disabled={pending}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.code}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-background py-3 border-t">
        {dirty && <span className="text-xs text-orange-600">有未保存的更改</span>}
        <Button onClick={onSubmit} disabled={pending || !dirty}>
          {pending ? '保存中...' : '保存权限'}
        </Button>
      </div>
    </div>
  );
}
