import { redirectAfterLogin } from '@/app/actions/auth';
import { LoginForm } from '@/app/login/login-form';
import { BarChart3, ClipboardList, ShieldCheck, UserCog } from 'lucide-react';

type AdminLoginPageProps = {
  searchParams?: { error?: string; notice?: string };
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  await redirectAfterLogin();
  return (
    <main className="page auth-page">
      <section className="auth-shell">
        <div className="login-context">
          <div>
            <span className="badge warn">
              <ShieldCheck size={15} aria-hidden="true" />
              后台端
            </span>
            <h1>题库、用户、统计和登录安全统一处理。</h1>
            <p>
              面向管理员和教练的运营入口。登录后将根据角色权限显示可用模块，减少误操作和无关入口。
            </p>
          </div>
          <div className="login-context-grid">
            <div className="login-context-item">
              <strong>
                <ClipboardList size={16} aria-hidden="true" />
                题库维护
              </strong>
              <span>科目、分类、题目和导入</span>
            </div>
            <div className="login-context-item">
              <strong>
                <BarChart3 size={16} aria-hidden="true" />
                学员统计
              </strong>
              <span>练习次数、正确率、历史</span>
            </div>
            <div className="login-context-item">
              <strong>
                <UserCog size={16} aria-hidden="true" />
                角色权限
              </strong>
              <span>按岗位控制后台功能</span>
            </div>
            <div className="login-context-item">
              <strong>
                <ShieldCheck size={16} aria-hidden="true" />
                登录审计
              </strong>
              <span>设备、IP 和失败原因</span>
            </div>
          </div>
        </div>
        <LoginForm
          title="后台登录"
          error={searchParams?.error}
          notice={searchParams?.notice}
        />
      </section>
    </main>
  );
}
