'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { changePassword } from './actions';

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const { update } = useSession();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const oldPassword = String(fd.get('oldPassword') ?? '');
    const newPassword = String(fd.get('newPassword') ?? '');
    const confirm = String(fd.get('confirm') ?? '');

    startTransition(async () => {
      const res = await changePassword({ oldPassword, newPassword, confirm });
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success('密码修改成功');

      if (forced) {
        // Update JWT so middleware no longer redirects to /change-password.
        await update({ mustChangePassword: false });
        router.push('/dashboard');
        router.refresh();
      } else {
        // Force re-login for security after voluntary password change.
        await signOut({ callbackUrl: '/login' });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="oldPassword">旧密码</Label>
        <Input id="oldPassword" name="oldPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">新密码</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
        <p className="text-xs text-muted-foreground">至少 8 位,需包含字母和数字</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">确认新密码</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? '提交中...' : '修改密码'}
      </Button>
    </form>
  );
}
