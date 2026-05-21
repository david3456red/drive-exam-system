import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LoginForm } from './login-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="text-3xl">驾考答题系统</CardTitle>
          <CardDescription>请使用账号登录;首次登录后需修改密码</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
