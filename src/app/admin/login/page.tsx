import { redirectAfterLogin } from '@/app/actions/auth';
import { LoginForm } from '@/app/login/login-form';

type AdminLoginPageProps = {
  searchParams?: { error?: string; notice?: string };
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  await redirectAfterLogin();
  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <LoginForm
        title="后台登录"
        error={searchParams?.error}
        notice={searchParams?.notice}
      />
    </main>
  );
}
