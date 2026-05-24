import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { homePathFor } from '@/lib/role-checks';
import { ChangePasswordForm } from './change-password-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const home = homePathFor(session.user.roleName);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">修改密码</CardTitle>
          <CardDescription>修改成功后将自动退出,请重新登录</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm homeHref={home} />
        </CardContent>
      </Card>
    </div>
  );
}
