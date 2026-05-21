import { auth } from '@/auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

const ROLE_DESC: Record<string, string> = {
  super_admin: '你是超级管理员,可以管理用户、角色、题库以及系统配置。',
  admin: '你是管理员,可以管理题库、用户和登录日志。',
  teacher: '你是教练,可以查看学员的答题记录与统计。',
  student_strict: '你是严格学员。注意:在不同 IP 或设备登录会被自动冻结。',
  student_normal: '你是普通学员,在任意设备都可以学习。',
};

export default async function DashboardPage() {
  const session = await auth();
  const u = session!.user;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">你好,{u.name ?? u.username} 👋</h1>
        <p className="text-muted-foreground">{ROLE_DESC[u.roleName] ?? '欢迎使用驾考答题系统'}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">📚 题库</CardTitle>
            <CardDescription>科一、科四理论题库</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            支持单选、多选、判断三种题型;可按章节(自定义分类)练习。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">📝 答题模式</CardTitle>
            <CardDescription>顺序 / 随机 / 章节 / 模拟考试 / 错题重做</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            模拟考试自动计分,错题自动收入错题本。
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">📊 我的进度</CardTitle>
            <CardDescription>答题统计、错题分布</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            P3 阶段实现:开发中,敬请期待。
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground border-t pt-4">
        当前角色权限点 ({u.permissions.length}): <span className="font-mono">{u.permissions.join(', ') || '无'}</span>
      </div>
    </div>
  );
}
