import Link from 'next/link';
import {
  BookOpenCheck,
  ClipboardList,
  FolderTree,
  Gauge,
  History,
  ListChecks,
  PlayCircle,
  RotateCcw,
  Shuffle,
  Trash2,
} from 'lucide-react';

import { startSessionAction, abandonAttemptAction, adoptExpiredMockForCurrentUser } from './actions';
import { prisma } from '@/lib/db';
import { EXAM_MODE_LABEL } from '@/lib/display';
import { hasPermission } from '@/lib/permissions';
import { requireUser } from '@/lib/server-session';

const MODES = ['SEQUENTIAL', 'RANDOM', 'CHAPTER', 'MOCK', 'WRONG_REVIEW'] as const;
const MODE_ICON = {
  SEQUENTIAL: ListChecks,
  RANDOM: Shuffle,
  CHAPTER: FolderTree,
  MOCK: Gauge,
  WRONG_REVIEW: ClipboardList,
} as const;

type ExamPageProps = {
  searchParams?: { error?: string };
};

export default async function ExamPage({ searchParams }: ExamPageProps) {
  const user = requireUser('exam:practice');
  await adoptExpiredMockForCurrentUser();

  const [banks, categories, ongoing] = await Promise.all([
    prisma.questionBank.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { questions: true } } },
    }),
    prisma.category.findMany({ orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }] }),
    prisma.examAttempt.findMany({
      where: { userId: user.id, status: 'ONGOING' },
      select: { id: true, bankId: true, mode: true },
    }),
  ]);

  const ongoingKey = new Map(
    ongoing.map((attempt) => [`${attempt.bankId ?? 'wrong'}:${attempt.mode}`, attempt.id]),
  );
  const canMock = hasPermission({ user }, 'exam:mock');

  return (
    <main className="page stack">
      <div className="page-title">
        <span className="badge good">
          <BookOpenCheck size={15} aria-hidden="true" />
          学员前台
        </span>
        <h1>开始练习</h1>
        <p>选择题库和练习模式。进行中的会话会优先恢复，模拟考试离场后会自动兜底结算。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}
      <div className="cluster">
        <Link className="button" href="/exam/wrong">
          <ClipboardList size={17} aria-hidden="true" />
          错题本
        </Link>
        <Link className="button" href="/exam/history">
          <History size={17} aria-hidden="true" />
          答题记录
        </Link>
      </div>
      <section className="grid">
        {banks.map((bank) => (
          <article className="card stack" key={bank.id}>
            <div>
              <span className="badge">
                <BookOpenCheck size={15} aria-hidden="true" />
                {bank.code}
              </span>
              <h2>{bank.name}</h2>
              <p className="muted">当前题量：{bank._count.questions}</p>
            </div>
            <div className="stack">
              {MODES.filter((mode) => mode !== 'WRONG_REVIEW').map((mode) => {
                const attemptId = ongoingKey.get(`${bank.id}:${mode}`);
                if (mode === 'MOCK' && !canMock) return null;
                const ModeIcon = MODE_ICON[mode];
                return (
                  <div className="cluster" key={mode}>
                    {attemptId ? (
                      <>
                        <Link className="button primary" href={`/exam/session/${attemptId}`}>
                          <RotateCcw size={17} aria-hidden="true" />
                          继续{EXAM_MODE_LABEL[mode]}
                        </Link>
                        <form action={abandonAttemptAction}>
                          <input type="hidden" name="attemptId" value={attemptId} />
                          <button className="ghost" type="submit">
                            <Trash2 size={17} aria-hidden="true" />
                            放弃
                          </button>
                        </form>
                      </>
                    ) : (
                      <form action={startSessionAction} className="stack" style={{ width: '100%' }}>
                        <input type="hidden" name="bankId" value={bank.id} />
                        <input type="hidden" name="mode" value={mode} />
                        {mode === 'CHAPTER' ? (
                          <div className="field">
                            <label>章节分类</label>
                            <div className="cluster">
                              {categories.length === 0 ? (
                                <span className="muted">暂无分类，可先在后台添加</span>
                              ) : (
                                categories.map((category) => (
                                  <label className="badge" key={category.id}>
                                    <input
                                      type="checkbox"
                                      name="categoryIds"
                                      value={category.id}
                                    />{' '}
                                    {category.name}
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                        ) : null}
                        <button className={mode === 'MOCK' ? 'danger' : 'primary'} type="submit">
                          <ModeIcon size={17} aria-hidden="true" />
                          {EXAM_MODE_LABEL[mode]}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
        <article className="card stack">
          <div>
            <span className="badge warn">
              <ClipboardList size={15} aria-hidden="true" />
              错题
            </span>
            <h2>{EXAM_MODE_LABEL.WRONG_REVIEW}</h2>
            <p className="muted">按最近答错时间倒序抽取未掌握错题。</p>
          </div>
          {ongoingKey.get('wrong:WRONG_REVIEW') ? (
            <Link className="button primary" href={`/exam/session/${ongoingKey.get('wrong:WRONG_REVIEW')}`}>
              <RotateCcw size={17} aria-hidden="true" />
              继续错题重做
            </Link>
          ) : (
            <form action={startSessionAction}>
              <input type="hidden" name="mode" value="WRONG_REVIEW" />
              <button className="primary" type="submit">
                <PlayCircle size={17} aria-hidden="true" />
                开始错题重做
              </button>
            </form>
          )}
        </article>
      </section>
    </main>
  );
}
