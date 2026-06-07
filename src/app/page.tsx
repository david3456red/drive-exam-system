import Link from 'next/link';
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardList,
  Gauge,
  History,
  ShieldCheck,
} from 'lucide-react';

import { prisma } from '@/lib/db';
import {
  VEHICLE_LABELS,
  WORKBENCH_VEHICLE_CODES,
  buildExamWorkbench,
} from '@/lib/exam-workbench';
import { getCurrentUser } from '@/lib/server-session';
import { homeForRole } from '@/lib/session-shared';

export default async function HomePage() {
  const user = getCurrentUser();
  const href = user ? homeForRole(user.roleCode) : '/login';
  const banks = await prisma.questionBank.findMany({
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { questions: true } } },
  });
  const workbench = buildExamWorkbench(banks);
  const bankCount = banks.length;
  const questionCount = banks.reduce((sum, bank) => sum + bank._count.questions, 0);

  return (
    <main className="page stack study-home">
      <section className="study-hero">
        <div className="study-hero-copy">
          <span className="badge good">悟空式目录 · 车型 · 科目 · 章节</span>
          <h1>先选车型，再选科目，直接开始练题。</h1>
          <p>
            首页只保留高频路径：练习、模拟考试、错题集、成绩单。题库同步后，学员从这里能像悟空交规一样按目录快速进入章节。
          </p>
          <div className="workbench-actions">
            <Link className="button primary" href={href}>
              <Gauge size={17} aria-hidden="true" />
              进入工作台
            </Link>
            <Link className="button" href="/exam">
              <BookOpenCheck size={17} aria-hidden="true" />
              开始练习
            </Link>
            <Link className="button" href="/admin/questions/import/wukong">
              <ShieldCheck size={17} aria-hidden="true" />
              悟空同步
            </Link>
          </div>
        </div>

        <aside className="quick-board" aria-label="快捷入口">
          <div className="quick-board-head">
            <span className="badge">今日入口</span>
            <strong>练习链路</strong>
          </div>
          <QuickLink href="/exam" icon={BookOpenCheck} title="章节练习" detail="顺序练习 / 随机练习" />
          <QuickLink href="/exam" icon={Gauge} title="模拟考试" detail="固定题量计时交卷" />
          <QuickLink href="/exam/wrong" icon={ClipboardList} title="错题集" detail="未掌握题目复盘" />
          <QuickLink href="/exam/history" icon={History} title="成绩单" detail="历史分数和答题详情" />
        </aside>
      </section>

      <section className="study-summary" aria-label="系统概览">
        <Metric title="题库" value={bankCount} />
        <Metric title="题目" value={questionCount} />
        <Metric title="车型入口" value={workbench.length} />
      </section>

      <section className="directory-panel stack" aria-label="车型题库目录">
        <div className="directory-head">
          <div>
            <span className="badge good">题库目录</span>
            <h2>按车型查看可练科目</h2>
          </div>
          <Link className="button" href="/exam">
            全部练习
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>

        <div className="vehicle-directory">
          {WORKBENCH_VEHICLE_CODES.map((code) => {
            const vehicle = workbench.find((item) => item.code === code);
            return (
              <article className="vehicle-row" key={code}>
                <div>
                  <strong>{VEHICLE_LABELS[code]}</strong>
                  <span className="muted">
                    {vehicle
                      ? `${vehicle.subjects.length} 个科目 / 专项`
                      : '待同步'}
                  </span>
                </div>
                <div className="subject-links">
                  {vehicle ? (
                    vehicle.subjects.map((subject) => (
                      <Link
                        className="subject-chip"
                        href={`/exam?vehicle=${vehicle.code}&subject=${subject.code}`}
                        key={`${vehicle.code}-${subject.code}`}
                      >
                        <span>{subject.label}</span>
                        <strong>{subject.bank._count.questions}</strong>
                      </Link>
                    ))
                  ) : (
                    <span className="segment disabled">待同步</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string;
  icon: typeof BookOpenCheck;
  title: string;
  detail: string;
}) {
  return (
    <Link className="quick-link" href={href}>
      <span className="status-mark">
        <Icon size={17} aria-hidden="true" />
      </span>
      <span>
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{title}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}
