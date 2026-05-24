'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { createBank, updateBank } from './actions';

export type BankFormValues = {
  id?: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isBuiltin: boolean;
};

export function BankForm({ initial }: { initial?: BankFormValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const isEdit = !!initial?.id;

  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [sortOrder, setSortOrder] = useState<number>(initial?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
        sortOrder: Number(sortOrder) || 0,
        isActive,
      };
      const res = isEdit
        ? await updateBank({ id: initial!.id!, ...payload })
        : await createBank(payload);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? '已保存' : '已创建');
      router.push('/admin/banks');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="code">题库 code (唯一标识)</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="例如 subject_3"
          disabled={pending || (isEdit && initial?.isBuiltin)}
          required
        />
        <p className="text-xs text-muted-foreground">
          小写字母 / 数字 / _ / -;{isEdit && initial?.isBuiltin ? '内置题库 code 不可修改' : '建库后改 code 会断开种子脚本的 upsert 关联,慎改'}。
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">名称</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如 科目三(理论)"
          disabled={pending}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">描述(可选)</Label>
        <Textarea
          id="description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          disabled={pending}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sortOrder">排序值</Label>
          <Input
            id="sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">小的排前面</p>
        </div>
        <div className="space-y-2">
          <Label>启用</Label>
          <label className="flex items-center gap-2 h-10 cursor-pointer">
            <Checkbox
              checked={isActive}
              onCheckedChange={(v) => setIsActive(v === true)}
              disabled={pending}
            />
            <span className="text-sm">{isActive ? '已启用' : '已停用'}</span>
          </label>
          <p className="text-xs text-muted-foreground">停用后学生看不到</p>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          取消
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? '保存中...' : isEdit ? '保存' : '创建'}
        </Button>
      </div>
    </form>
  );
}
