import { redirectAfterLogin } from '@/app/actions/auth';
import { BarChart3, BookOpenCheck, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { LoginForm } from './login-form';

type LoginPageProps = {
  searchParams?: { error?: string; notice?: string };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await redirectAfterLogin('student');
  return (
    <main className="page auth-page">
      <section className="auth-shell">
        <div className="login-context">
          <div>
            <span className="badge good">
              <BookOpenCheck size={15} aria-hidden="true" />
              学生端
            </span>
            <h1>进入练习后，直接继续你的训练进度。</h1>
            <p>
              支持顺序练习、随机练习、章节练习、模拟考试和错题重做。登录后系统会记录设备信息用于账号安全风控。
            </p>
          </div>
          <div className="login-context-grid">
            <div className="login-context-item">
              <strong>
                <ClipboardCheck size={16} aria-hidden="true" />
                5 种模式
              </strong>
              <span>覆盖日常练习到正式模拟</span>
            </div>
            <div className="login-context-item">
              <strong>
                <BookOpenCheck size={16} aria-hidden="true" />
                错题追踪
              </strong>
              <span>自动沉淀薄弱题目</span>
            </div>
            <div className="login-context-item">
              <strong>
                <BarChart3 size={16} aria-hidden="true" />
                成绩记录
              </strong>
              <span>复盘每次答题结果</span>
            </div>
            <div className="login-context-item">
              <strong>
                <ShieldCheck size={16} aria-hidden="true" />
                设备风控
              </strong>
              <span>识别异常登录行为</span>
            </div>
          </div>
        </div>
        <LoginForm
          title="学生登录"
          loginEntry="student"
          error={searchParams?.error}
          notice={searchParams?.notice}
        />
      </section>
    </main>
  );
}
