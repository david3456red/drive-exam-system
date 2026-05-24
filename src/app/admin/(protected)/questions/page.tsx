import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function AdminQuestionsPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'question:read')) redirect('/admin');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">题目</h1>
      <Card>
        <CardHeader>
          <CardTitle>开发中</CardTitle>
          <CardDescription>P2 阶段:题目列表、过滤、JSON / Excel 批量导入、单条增改删</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
