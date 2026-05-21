import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function UsersPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'user:read')) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">用户管理</h1>
      <Card>
        <CardHeader>
          <CardTitle>开发中</CardTitle>
          <CardDescription>P4 阶段实现:用户列表 / 创建 / 解冻 / 重置密码</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
