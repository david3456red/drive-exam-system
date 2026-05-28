import { redirectAfterLogin } from '@/app/actions/auth';
import { LoginForm } from './login-form';

type LoginPageProps = {
  searchParams?: { error?: string; notice?: string };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  await redirectAfterLogin();
  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <LoginForm
        title="学生登录"
        error={searchParams?.error}
        notice={searchParams?.notice}
      />
    </main>
  );
}
