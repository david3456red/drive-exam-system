import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ChangePasswordForm } from './change-password-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">修改密码</CardTitle>
          <CardDescription>
            {session.user.mustChangePassword
              ? '首次登录,请先修改初始密码'
              : '请输入旧密码与新密码'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm forced={session.user.mustChangePassword} />
        </CardContent>
      </Card>
    </div>
  );
}
