import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const REASON_DISPLAY: Record<string, string> = {
  wrong_password: '密码错误',
  frozen_remote_login: '异地登录冻结',
  account_disabled: '账号停用',
  account_frozen: '账号已冻结',
  user_not_found: '用户不存在',
  missing_device_id: '缺少设备ID',
};

export default async function LoginLogsPage() {
  const session = await auth();
  if (!hasPermission(session!.user, 'system:login_log')) redirect('/admin');

  const logs = await prisma.loginLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { username: true, name: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">登录日志</h1>
      <p className="text-muted-foreground text-sm">最近 100 条登录记录(成功 / 失败 / 冻结)</p>

      <Card>
        <CardHeader>
          <CardTitle>记录</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4">时间</th>
                <th className="py-2 pr-4">用户</th>
                <th className="py-2 pr-4">结果</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2 pr-4">设备ID</th>
                <th className="py-2 pr-4">原因</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    暂无记录
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs">
                    {new Date(log.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="py-2 pr-4">
                    {log.user.name ?? log.user.username}
                    <span className="text-muted-foreground ml-1 text-xs">@{log.user.username}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        log.success
                          ? 'inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs'
                          : 'inline-block px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs'
                      }
                    >
                      {log.success ? '成功' : '失败'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{log.ip}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{log.deviceId.slice(0, 12)}...</td>
                  <td className="py-2 pr-4 text-xs">
                    {log.reason ? (REASON_DISPLAY[log.reason] ?? log.reason) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
