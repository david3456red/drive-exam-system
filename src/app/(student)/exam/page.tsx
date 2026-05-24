/**
 * `/exam` 模式选择页 —— 学员前台的入口。
 *
 * 服务端职责:
 * 1. **过期模考兜底**:进入页面时主动调用 `adoptExpiredMock()`,把所有
 *    `expiresAt < now - 60s` 的 `ONGOING` 模考会话结算为 `ABANDONED`,
 *    避免历史遗留的"僵尸模考"挡住下次开新卷(对应需求 5.4 / 5.9)。
 * 2. 加载所有可用题库(`isActive: true`),并附带题目数。
 * 3. 加载当前用户全部 `ONGOING` 会话,供客户端组件判断"继续上次 / 放弃后重开"
 *    (对应需求 1.8)。
 * 4. 加载全局分类列表给章节模式 dialog;具体的"题库 → 分类"过滤由
 *    `startSession` 服务端校验完成,这里不需要按 bankId 预过滤。
 *
 * 客户端交互全部由 `_components/exam-mode-picker.tsx` 接管,本文件保持
 * 纯 Server Component 形态以减小客户端 bundle。
 *
 * @see Requirements 1.1, 1.2, 1.5, 1.8, 5.4, 5.9
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { ExamModePicker } from './_components/exam-mode-picker';
import { adoptExpiredMock } from './actions';

export default async function ExamHomePage() {
  const session = await auth();
  // `(student)` layout 已经强制重定向未登录用户,此处可放心使用 `!`。
  const user = session!.user;

  // 1. 兜底过期模考。即使没有过期会话,该 Action 也只会做一次空查询,代价很低。
  await adoptExpiredMock();

  // 2. 题库列表(并发拉取,与会话 / 分类查询不存在依赖关系)。
  const [banks, ongoingAttempts, categories] = await Promise.all([
    prisma.questionBank.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        _count: { select: { questions: true } },
      },
    }),
    prisma.examAttempt.findMany({
      where: { userId: user.id, status: 'ONGOING' },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        mode: true,
        bankId: true,
        startedAt: true,
      },
    }),
    prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, parentId: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">
          你好,{user.name ?? user.username} 👋
        </h1>
        <p className="text-muted-foreground text-sm">选择一个题库和模式开始练习</p>
      </div>

      <ExamModePicker
        banks={banks.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          description: b.description,
          questionCount: b._count.questions,
        }))}
        ongoingAttempts={ongoingAttempts}
        categories={categories}
      />
    </div>
  );
}
