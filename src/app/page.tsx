import Link from 'next/link';
import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  Gauge,
  History,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/server-session';
import { homeForRole } from '@/lib/session-shared';

export default async function HomePage() {
  const user = getCurrentUser();
  const href = user ? homeForRole(user.roleCode) : '/login';
  const [bankCount, questionCount] = await Promise.all([
    prisma.questionBank.count(),
    prisma.question.count(),
  ]);

  return (
    <main className="page workbench-home">
      <section className="workbench-hero">
        <div className="workbench-intro">
          <div className="workbench-title">
            <span className="badge good">角色工作台 · 练习 · 运营 · 风控</span>
            <h1>驾考训练和题库运营，从同一个入口开始。</h1>
            <p>
              学员进入练习，教练查看训练数据，管理员维护题库和账号安全。首页按真实使用角色组织入口，减少来回寻找页面。
            </p>
          </div>

          <div className="workbench-actions">
            <Link className="button primary" href={href}>
              <Gauge size={17} aria-hidden="true" />
              进入工作台
            </Link>
            <Link className="button" href="/login">
              <BookOpenCheck size={17} aria-hidden="true" />
              学生登录
            </Link>
            <Link className="button" href="/admin/login">
              <ShieldCheck size={17} aria-hidden="true" />
              后台登录
            </Link>
          </div>

          <div className="workbench-metrics" aria-label="系统概览">
            <div className="workbench-metric">
              <span>题库</span>
              <strong>{bankCount}</strong>
            </div>
            <div className="workbench-metric">
              <span>题目</span>
              <strong>{questionCount}</strong>
            </div>
            <div className="workbench-metric">
              <span>练习模式</span>
              <strong>5</strong>
            </div>
          </div>
        </div>

        <aside className="workbench-panel" aria-label="今日入口">
          <div>
            <span className="badge">今日任务</span>
            <h2>高频入口放在首屏</h2>
            <p className="muted">练习、题库、统计按任务路径排列，登录后还会进入对应角色的默认工作台。</p>
          </div>
          <div className="status-board">
            <Link className="status-row" href="/exam">
              <span className="status-mark">
                <BookOpenCheck size={17} aria-hidden="true" />
              </span>
              <span>
                <strong>开始练习</strong>
                <span>顺序、随机、章节和模拟考试</span>
              </span>
              <span className="badge good">学生</span>
            </Link>
            <Link className="status-row" href="/admin/questions">
              <span className="status-mark">
                <ClipboardList size={17} aria-hidden="true" />
              </span>
              <span>
                <strong>维护题库</strong>
                <span>录入、导入、筛选和查看题目</span>
              </span>
              <span className="badge">后台</span>
            </Link>
            <Link className="status-row" href="/admin/student-stats">
              <span className="status-mark">
                <BarChart3 size={17} aria-hidden="true" />
              </span>
              <span>
                <strong>查看训练统计</strong>
                <span>练习次数、正确率和历史记录</span>
              </span>
              <span className="badge warn">教练</span>
            </Link>
          </div>
          <div className="mini-chart" aria-hidden="true" />
        </aside>
      </section>

      <section className="home-modules" aria-label="核心模块">
        <article className="home-module">
          <span className="badge good">
            <BookOpenCheck size={15} aria-hidden="true" />
            学生端
          </span>
          <h2>按场景练题</h2>
          <p>顺序练习、随机练习、章节练习和错题复盘。</p>
        </article>
        <article className="home-module">
          <span className="badge warn">
            <Gauge size={15} aria-hidden="true" />
            考试
          </span>
          <h2>模拟考试</h2>
          <p>固定题量、计时提交、自动评分和记录回看。</p>
        </article>
        <article className="home-module">
          <span className="badge">
            <UsersRound size={15} aria-hidden="true" />
            后台
          </span>
          <h2>题库维护</h2>
          <p>题库、分类、题目、批量导入和权限控制。</p>
        </article>
        <article className="home-module">
          <span className="badge">
            <History size={15} aria-hidden="true" />
            安全
          </span>
          <h2>登录审计</h2>
          <p>记录登录设备、IP、失败原因和异地风险。</p>
        </article>
      </section>
    </main>
  );
}
