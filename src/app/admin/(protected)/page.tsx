import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const ROLE_DESC: Record<string, string> = {
  super_admin: '你是超级管理员,可以管理用户、角色、题库以及系统配置。',
  admin: '你是管理员,可以管理题库、用户和登录日志。',
  teacher: '你是教练,可以查看学员的答题记录与统计。',
};

export default async function AdminDashboardPage() {
  const session = await auth();
  const u = session!.user;

  const [userCount, bankCount, questionCount, recentLogins] = await Promise.all([
    prisma.user.count(),
    prisma.questionBank.count({ where: { isActive: true } }),
    prisma.question.count(),
    prisma.loginLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">工作台</h1>
        <p className="text-muted-foreground">
          {ROLE_DESC[u.roleName] ?? `欢迎,${u.name ?? u.username}`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="用户数" value={userCount} />
        <Stat title="启用题库" value={bankCount} />
        <Stat title="题目总量" value={questionCount} />
        <Stat title="近7日登录" value={recentLogins} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">📚 题库 / 题目</CardTitle>
            <CardDescription>P2 阶段 — 开发中</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            新建题库 · 自定义分类 · JSON / Excel 批量导入题目
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">👥 用户管理</CardTitle>
            <CardDescription>P4 阶段 — 开发中</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            创建账号 · 解冻 · 重置密码 · 启停账号
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground border-t pt-4">
        当前角色权限点 ({u.permissions.length}):{' '}
        <span className="font-mono break-all">{u.permissions.join(', ') || '无'}</span>
      </div>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
