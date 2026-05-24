/**
 * 错题本页 (`/exam/wrong`) - Server Component。
 *
 * 这一层只做三件事:
 *
 * 1. 校验登录态(由 `(student)/layout.tsx` 已经统一兜底,这里直接读取
 *    `auth()` 拿到 `userId`)。
 * 2. 解析 URL 上的筛选参数(题库 / 掌握状态 / 分页页码),并归一化为
 *    安全的取值后传给 `listWrongQuestions`。
 * 3. 加上"题库下拉"需要的题库列表,把所有数据透传给客户端组件
 *    `WrongList`,由后者负责筛选交互、标记掌握与分页。
 *
 * 与设计文档"Components and Interfaces · WrongList"以及任务 16.9 的
 * 拆分约定一致:Server Component 负责数据,Client Component 负责交互,
 * 这样避免在客户端再发一次查询,也避免把 `prisma` 引用泄漏到客户端打包。
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { listWrongQuestions } from '@/lib/exam-engine/queries';
import { WrongList, type MasteredFilter } from './_components/wrong-list';

export default async function WrongQuestionsPage(props: {
  searchParams: Promise<{ page?: string; bankId?: string; mastered?: string }>;
}) {
  const sp = await props.searchParams;
  const session = await auth();
  // `(student)/layout.tsx` 已确保未登录会被重定向,此处用非空断言获取 userId。
  const userId = session!.user.id;

  // 分页参数:`page` 至少为 1,非数字归为 1;`pageSize` 固定 20。
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  // 题库筛选:URL 上的空字符串当作"未选",直接传 undefined。
  const bankId = sp.bankId || undefined;

  // 掌握状态筛选:只接受三种合法取值,其它情况一律视为 'all'。
  const masteredFilter: MasteredFilter =
    sp.mastered === 'mastered'
      ? 'mastered'
      : sp.mastered === 'unmastered'
        ? 'unmastered'
        : 'all';

  // 错题本数据 + 题库下拉所需数据。`Promise.all` 并发以减少首屏延迟。
  const [result, banks] = await Promise.all([
    listWrongQuestions({
      userId,
      page,
      pageSize: 20,
      bankId,
      masteredFilter,
    }),
    prisma.questionBank.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">错题本</h1>
        <p className="text-muted-foreground text-sm mt-1">
          回顾历次答错的题目,连续答对 3 次会自动标记为已掌握,你也可以手动切换。
        </p>
      </div>

      <WrongList
        items={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        bankId={bankId}
        masteredFilter={masteredFilter}
        banks={banks}
      />
    </div>
  );
}
