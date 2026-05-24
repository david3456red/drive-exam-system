'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteQuestion } from './actions';

export function DeleteQuestionButton({ id, content }: { id: string; content: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!window.confirm(`确认删除题目?\n\n${content.slice(0, 80)}${content.length > 80 ? '...' : ''}`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteQuestion(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('已删除');
      router.refresh();
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      <Trash2 className="h-3.5 w-3.5 text-destructive" />
    </Button>
  );
}
