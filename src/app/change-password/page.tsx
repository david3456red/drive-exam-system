import { changePasswordAction } from '@/app/actions/auth';
import { requireUser } from '@/lib/server-session';

type ChangePasswordPageProps = {
  searchParams?: { error?: string };
};

export default function ChangePasswordPage({
  searchParams,
}: ChangePasswordPageProps) {
  requireUser();

  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <form action={changePasswordAction} className="panel stack">
        <div>
          <span className="badge">账号安全</span>
          <h1>修改密码</h1>
          <p className="muted">修改成功后会立即退出登录，需要使用新密码重新登录。</p>
        </div>
        {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}
        <div className="field">
          <label htmlFor="oldPassword">旧密码</label>
          <input id="oldPassword" name="oldPassword" type="password" required />
        </div>
        <div className="field">
          <label htmlFor="newPassword">新密码</label>
          <input id="newPassword" name="newPassword" type="password" required />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">确认新密码</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
          />
        </div>
        <button type="submit" className="primary">
          保存并重新登录
        </button>
      </form>
    </main>
  );
}
