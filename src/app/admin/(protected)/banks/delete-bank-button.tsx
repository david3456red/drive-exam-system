'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteBank } from './actions';

export function DeleteBankButton({
  id,
  name,
  questionCount,
}: {
  id: string;
  name: string;
  questionCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (questionCount > 0) {
      toast.error(`题库 "${name}" 下有 ${questionCount} 道题,请先清空。`);
      return;
    }
    if (!window.confirm(`确认删除题库 "${name}" ?此操作不可恢复。`)) return;
    startTransition(async () => {
      const res = await deleteBank(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('已删除');
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      <Trash2 className="h-3.5 w-3.5 mr-1" />
      {pending ? '删除中...' : '删除'}
    </Button>
  );
}
