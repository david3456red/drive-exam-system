import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from '@/app/login/login-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-slate-100 dark:bg-slate-950">
      <Card className="w-full max-w-md shadow-lg border-slate-300">
        <CardHeader className="space-y-2 text-center">
          <div className="text-xs font-mono text-muted-foreground">ADMIN PORTAL</div>
          <CardTitle className="text-2xl">管理后台</CardTitle>
          <CardDescription>请使用管理员或教练账号登录</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-40" />}>
            <LoginForm portal="admin" />
          </Suspense>
        </CardContent>
      </Card>
      <div className="mt-6 text-sm text-muted-foreground text-center space-x-3">
        <Link href="/" className="hover:text-foreground">← 回到首页</Link>
        <span className="text-border">|</span>
        <Link href="/login" className="hover:text-foreground">学生入口 →</Link>
      </div>
    </div>
  );
}
