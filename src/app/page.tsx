import Link from 'next/link';

import { getCurrentUser } from '@/lib/server-session';
import { homeForRole } from '@/lib/session-shared';

export default function HomePage() {
  const user = getCurrentUser();
  const href = user ? homeForRole(user.roleCode) : '/login';

  return (
    <main className="page">
      <section className="hero">
        <div className="stack">
          <span className="badge good">2C2G 友好 · SQLite 单进程</span>
          <h1>驾考答题系统</h1>
          <p>
            面向学员、教练和机构管理员的驾考题库系统。支持顺序练习、随机练习、章节练习、模拟考试、错题重做和后台题库维护。
          </p>
          <div className="cluster">
            <Link className="button primary" href={href}>
              进入系统
            </Link>
            <Link className="button" href="/admin/login">
              后台入口
            </Link>
          </div>
        </div>
        <div className="road-panel" aria-hidden="true" />
      </section>
    </main>
  );
}
