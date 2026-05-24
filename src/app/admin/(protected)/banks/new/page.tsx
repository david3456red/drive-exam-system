import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BankForm } from '../bank-form';

export default async function NewBankPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'bank:create')) redirect('/admin/banks');

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/banks">← 返回题库列表</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>新建题库</CardTitle>
        </CardHeader>
        <CardContent>
          <BankForm />
        </CardContent>
      </Card>
    </div>
  );
}
