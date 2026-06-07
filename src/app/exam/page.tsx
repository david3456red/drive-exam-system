import Link from 'next/link';
import {
  BookOpenCheck,
  ClipboardList,
  Gauge,
  History,
  ListChecks,
  PlayCircle,
  Shuffle,
} from 'lucide-react';

import { startSessionAction, adoptExpiredMockForCurrentUser } from './actions';
import { OngoingAttemptActions } from './ongoing-attempt-actions';
import { prisma } from '@/lib/db';
import { EXAM_MODE_LABEL } from '@/lib/display';
import {
  SUBJECT_LABELS,
  VEHICLE_LABELS,
  WORKBENCH_VEHICLE_CODES,
 buildExamWorkbench,
 defaultSubjectCode,
 defaultVehicleCode,
} from '@/lib/exam-workbench';
import { hasPermission } from '@/lib/permissions';
import { requireUser } from '@/lib/server-session';

type ExamPageProps = {
  searchParams?: { error?: string; vehicle?: string; subject?: string };
};

type CategoryRow = {
  id: string;
  name: string;
  count: number;
};

export default async function ExamPage({ searchParams }: ExamPageProps) {
  const user = requireUser('exam:practice');
  await adoptExpiredMockForCurrentUser();

  const [banks, ongoing] = await Promise.all([
    prisma.questionBank.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { questions: true } } },
    }),
    prisma.examAttempt.findMany({
      where: { userId: user.id, status: 'ONGOING' },
      select: { id: true, bankId: true, mode: true },
    }),
  ]);

 const workbench = buildExamWorkbench(banks);
 const requestedVehicle = searchParams?.vehicle;
 const requestedSubject = searchParams?.subject;
 const vehicleCode =
 requestedVehicle && WORKBENCH_VEHICLE_CODES.includes(requestedVehicle as (typeof WORKBENCH_VEHICLE_CODES)[number])
 ? requestedVehicle
 : defaultVehicleCode(workbench);
  const vehicle = workbench.find((item) => item.code === vehicleCode);
  const subjectCode =
    requestedSubject && vehicle?.subjects.some((item) => item.code === requestedSubject)
      ? requestedSubject
      : defaultSubjectCode(vehicle);
  const subject = vehicle?.subjects.find((item) => item.code === subjectCode);
  const selectedBank = subject?.bank;
  const categories = selectedBank ? await loadCategoryRows(selectedBank.id) : [];
  const ongoingKey = new Map(
    ongoing.map((attempt) => [`${attempt.bankId ?? 'wrong'}:${attempt.mode}`, attempt.id]),
  );
  const canMock = hasPermission({ user }, 'exam:mock');

  return (
    <main className="page stack exam-workbench">
      <div className="page-title">
        <span className="badge good">
          <BookOpenCheck size={15} aria-hidden="true" />
          练题目录
        </span>
        <h1>按车型、科目和章节练题</h1>
        <p>先选车型，再选科目或专项；每个章节都提供顺序练习和随机练习，模拟考试、错题集、成绩单固定在右侧。</p>
      </div>
      {searchParams?.error ? <div className="error">{searchParams.error}</div> : null}

      <section className="directory-panel stack">
        <div className="segmented" aria-label="车型">
          {WORKBENCH_VEHICLE_CODES.map((code) => {
            const available = workbench.some((item) => item.code === code);
            const active = code === vehicleCode;
            return available ? (
              <Link
                className={active ? 'segment active' : 'segment'}
                href={`/exam?vehicle=${code}`}
                key={code}
              >
                {VEHICLE_LABELS[code]}
              </Link>
            ) : (
              <span className="segment disabled" key={code}>
                {VEHICLE_LABELS[code]} · 待导入
              </span>
            );
          })}
        </div>

        {vehicle ? (
          <div className="segmented" aria-label="科目">
            {vehicle.subjects.map((item) => (
              <Link
                className={item.code === subjectCode ? 'segment active' : 'segment'}
                href={`/exam?vehicle=${vehicle.code}&subject=${item.code}`}
                key={item.code}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <div className="exam-workbench-layout">
        <section className="directory-panel stack">
          {selectedBank ? (
            <>
              <div className="directory-head">
                <div>
                  <span className="badge">
                    <BookOpenCheck size={15} aria-hidden="true" />
                    {selectedBank.name}
                  </span>
                  <h2>章节 / 套卷</h2>
                </div>
                <span className="badge good">{selectedBank._count.questions} 题</span>
              </div>

              <div className="cluster">
                {(['SEQUENTIAL', 'RANDOM'] as const).map((mode) => {
                  const attemptId = ongoingKey.get(`${selectedBank.id}:${mode}`);
                  const Icon = mode === 'SEQUENTIAL' ? ListChecks : Shuffle;
                  return attemptId ? (
                    <OngoingAttemptActions attemptId={attemptId} label={EXAM_MODE_LABEL[mode]} key={mode} />
                  ) : (
                    <form action={startSessionAction} key={mode}>
                      <input type="hidden" name="bankId" value={selectedBank.id} />
                      <input type="hidden" name="mode" value={mode} />
                      <button type="submit">
                        <Icon size={17} aria-hidden="true" />
                        整库{EXAM_MODE_LABEL[mode]}
                      </button>
                    </form>
                  );
                })}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>章节</th>
                      <th>题量</th>
                      <th>练习</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category) => (
                      <tr key={category.id}>
                        <td>{category.name}</td>
                        <td>{category.count}</td>
                        <td>
                          <div className="cluster">
                            <ChapterStartForm
                              bankId={selectedBank.id}
                              categoryId={category.id}
                              label="顺序"
                              mode="CHAPTER"
                            />
                            <ChapterStartForm
                              bankId={selectedBank.id}
                              categoryId={category.id}
                              label="随机"
                              mode="CHAPTER_RANDOM"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {categories.length === 0 ? <div className="empty">暂无章节分类，可先导入题库。</div> : null}
              </div>
            </>
          ) : (
            <div className="empty">该车型暂未导入题库。</div>
          )}
        </section>

        <aside className="panel stack exam-workbench-side">
          <div>
            <span className="badge warn">
              <Gauge size={15} aria-hidden="true" />
              考试与记录
            </span>
            <h2>{selectedBank ? SUBJECT_LABELS[selectedBank.subjectCode ?? ''] ?? selectedBank.name : '待选择题库'}</h2>
          </div>

          {selectedBank && canMock ? (
            ongoingKey.get(`${selectedBank.id}:MOCK`) ? (
              <OngoingAttemptActions
                attemptId={ongoingKey.get(`${selectedBank.id}:MOCK`)!}
                label={EXAM_MODE_LABEL.MOCK}
              />
            ) : (
              <form action={startSessionAction}>
                <input type="hidden" name="bankId" value={selectedBank.id} />
                <input type="hidden" name="mode" value="MOCK" />
                <button className="danger" type="submit">
                  <Gauge size={17} aria-hidden="true" />
                  模拟考试
                </button>
              </form>
            )
          ) : null}

          {ongoingKey.get('wrong:WRONG_REVIEW') ? (
            <OngoingAttemptActions attemptId={ongoingKey.get('wrong:WRONG_REVIEW')!} label="错题重做" />
          ) : (
            <form action={startSessionAction}>
              <input type="hidden" name="mode" value="WRONG_REVIEW" />
              <button type="submit">
                <PlayCircle size={17} aria-hidden="true" />
                错题重做
              </button>
            </form>
          )}

          <Link className="button" href="/exam/wrong">
            <ClipboardList size={17} aria-hidden="true" />
            错题集
          </Link>
          <Link className="button" href="/exam/history">
            <History size={17} aria-hidden="true" />
            成绩单
          </Link>
        </aside>
      </div>
    </main>
  );
}

function ChapterStartForm({
  bankId,
  categoryId,
  label,
  mode,
}: {
  bankId: string;
  categoryId: string;
  label: string;
  mode: 'CHAPTER' | 'CHAPTER_RANDOM';
}) {
  return (
    <form action={startSessionAction}>
      <input type="hidden" name="bankId" value={bankId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="categoryIds" value={categoryId} />
      <button type="submit">{label}</button>
    </form>
  );
}

async function loadCategoryRows(bankId: string): Promise<CategoryRow[]> {
  const rows = await prisma.questionCategory.findMany({
    where: { question: { bankId } },
    include: { category: true },
  });
  const byId = new Map<string, CategoryRow>();
  for (const row of rows) {
    const existing = byId.get(row.categoryId);
    if (existing) {
      existing.count++;
    } else {
      byId.set(row.categoryId, {
        id: row.categoryId,
        name: row.category.name,
        count: 1,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}
