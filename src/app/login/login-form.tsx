'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isBackendRole } from '@/lib/role-checks';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: '账号或密码错误',
  ACCOUNT_FROZEN: '账号已被冻结,请联系管理员解冻',
  ACCOUNT_DISABLED: '账号已被停用',
  FROZEN_REMOTE_LOGIN: '检测到异地登录,账号已被冻结。请联系管理员解冻。',
  MISSING_DEVICE_ID: '设备识别失败,请刷新页面重试',
  CredentialsSignin: '登录失败,请稍后再试',
};

/**
 * Shared login form.
 *
 * - portal="student": admin/teacher accounts get redirected to /admin
 *   after successful login (with a notice).
 * - portal="admin":   student accounts get redirected to /exam
 *   after successful login (with a notice).
 */
export function LoginForm({ portal }: { portal: 'student' | 'admin' }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [deviceId, setDeviceId] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    FingerprintJS.load()
      .then((fp) => fp.get())
      .then((res) => {
        if (!cancelled) setDeviceId(res.visitorId);
      })
      .catch(() => {
        if (!cancelled) setDeviceId('fallback-' + Math.random().toString(36).slice(2));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('username') ?? '').trim();
    const password = String(fd.get('password') ?? '');

    if (!username || !password) {
      setError('请输入账号和密码');
      return;
    }
    if (!deviceId) {
      setError('设备识别中,请稍候再试');
      return;
    }

    startTransition(async () => {
      const res = await signIn('credentials', {
        username,
        password,
        deviceId,
        redirect: false,
      });
      if (res?.error) {
        const code = res.code || res.error;
        const msg = ERROR_MESSAGES[code] || '登录失败';
        setError(msg);
        toast.error(msg);
        return;
      }

      // Determine target based on actual role from the session.
      const sessionRes = await fetch('/api/auth/session', { cache: 'no-store' });
      const session = await sessionRes.json().catch(() => null);
      const role: string | undefined = session?.user?.roleName;
      const isAdmin = isBackendRole(role);

      const callbackUrl = search.get('callbackUrl') || null;
      let target: string;

      if (portal === 'student') {
        if (isAdmin) {
          toast.info('您是管理员账号,已为您跳转到后台');
          target = '/admin';
        } else {
          target = callbackUrl ?? '/exam';
          toast.success('登录成功');
        }
      } else {
        // portal === 'admin'
        if (!isAdmin) {
          toast.info('您是学生账号,已为您跳转到学生入口');
          target = '/exam';
        } else {
          target = callbackUrl ?? '/admin';
          toast.success('登录成功');
        }
      }

      router.push(target);
      router.refresh();
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
        <Label htmlFor="username">账号</Label>
        <Input id="username" name="username" autoComplete="username" required disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending || !deviceId}>
        {pending ? '登录中...' : deviceId ? '登 录' : '设备识别中...'}
      </Button>
      <p className="text-xs text-muted-foreground text-center pt-2">
        设备指纹: <span className="font-mono">{deviceId ? deviceId.slice(0, 12) + '...' : '生成中...'}</span>
      </p>
    </form>
  );
}
