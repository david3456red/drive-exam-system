import Link from 'next/link';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { isBackendRole, homePathFor } from '@/lib/role-checks';
import { BookOpen, ShieldCheck, Trophy } from 'lucide-react';

/**
 * Public landing page (`/`). Accessible without login. Shows a CTA tailored
 * to the visitor:
 *   - logged out  → "学生登录" + small "管理后台" link
 *   - student     → "进入学习"
 *   - admin/teacher → "进入管理后台"
 */
export default async function PublicHomePage() {
  const session = await auth();
  const u = session?.user ?? null;
  const home = u ? homePathFor(u.roleName) : null;
  const isAdmin = u ? isBackendRole(u.roleName) : false;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-white to-white dark:from-slate-900 dark:via-slate-950 dark:to-slate-950">
      {/* top bar */}
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="font-bold text-xl">🚗 驾考答题系统</div>
        {!u && (
          <Link
            href="/admin/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            管理后台 →
          </Link>
        )}
      </header>

      {/* hero */}
      <section className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-3xl text-center space-y-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            考驾照,先把理论刷扎实
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground">
            支持科目一 / 科目四题库,顺序、随机、章节、模拟考试、错题重做
            <br className="hidden sm:block" />
            手机电脑都能答,记录全程同步。
          </p>

          {u ? (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg" className="text-base">
                <Link href={home!}>{isAdmin ? '进入管理后台' : '继续学习'}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base">
                <Link href="/change-password">修改密码</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg" className="text-base px-8">
                <Link href="/login">学生登录</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* features */}
      <section className="max-w-5xl mx-auto px-6 pb-12 grid gap-4 md:grid-cols-3">
        <Feature
          icon={<BookOpen className="h-6 w-6 text-blue-600" />}
          title="多种练习模式"
          desc="顺序 · 随机 · 按分类 · 模拟考试 · 错题重做"
        />
        <Feature
          icon={<Trophy className="h-6 w-6 text-yellow-600" />}
          title="自动统计成绩"
          desc="模拟考试自动计分,错题自动收入错题本"
        />
        <Feature
          icon={<ShieldCheck className="h-6 w-6 text-green-600" />}
          title="账号安全"
          desc="管理员开账号,严格学员异地登录自动冻结"
        />
      </section>

      <footer className="text-center text-xs text-muted-foreground py-6 border-t">
        驾考答题系统 · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-2">
        <div>{icon}</div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{desc}</div>
      </CardContent>
    </Card>
  );
}
