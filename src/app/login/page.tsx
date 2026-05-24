import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

/**
 * Student login. Already-logged-in users are redirected by the middleware,
 * so we don't need to check here.
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-blue-50 to-white dark:from-slate-900 dark:to-slate-950">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl">学生登录</CardTitle>
          <CardDescription>请使用管理员发放的账号登录</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-40" />}>
            <LoginForm portal="student" />
          </Suspense>
        </CardContent>
      </Card>
      <div className="mt-6 text-sm text-muted-foreground text-center space-x-3">
        <Link href="/" className="hover:text-foreground">← 回到首页</Link>
        <span className="text-border">|</span>
        <Link href="/admin/login" className="hover:text-foreground">管理后台 →</Link>
      </div>
    </div>
  );
}
