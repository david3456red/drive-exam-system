/**
 * 答题会话结果页 (`/exam/session/[attemptId]/result`)
 *
 * Server Component，渲染单次答题会话的成绩汇总：
 *
 * - 读取并校验 `ExamAttempt` 归属（仅本人可见，否则 404）。
 * - 顶部展示模式 + 题库名（无 bankId 视为「错题回顾」）。
 * - 中部成绩卡片：总题数、正确数、正确率（一位小数）、用时（mm:ss）。
 * - 模考模式额外按 `MOCK_CONFIG[bank.code].passScore` 显示「通过 / 未通过」徽标；
 *   `ABANDONED` 状态显示「未完成」徽标。
 * - 底部两个动作：「查看逐题详情」跳 `/exam/history/[attemptId]`，
 *   「返回练习首页」跳 `/exam`。
 *
 * 仅渲染逻辑，不做任何写入。会话统计字段（`totalCount` / `correctCount` /
 * `score` / `durationMs`）由 `finishSession` / `abandonSession` 在结束时
 * 写好（参见 design.md §Property 10），本页直接读取展示即可。
 */
import { auth } from '@/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { EXAM_MODE_DISPLAY, getMockConfig, type ExamMode } from '@/lib/exam-engine/types';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/** 把毫秒数格式化为 mm:ss；负值或 null 时返回 "00:00"。 */
function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default async function SessionResultPage(props: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await props.params;
  const session = await auth();
  const userId = session!.user.id;

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      mode: true,
      status: true,
      bankId: true,
      totalCount: true,
      correctCount: true,
      score: true,
      durationMs: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  if (!attempt || attempt.userId !== userId) {
    notFound();
  }

  // 题库名(可选)
  let bankName = '错题回顾';
  if (attempt.bankId) {
    const bank = await prisma.questionBank.findUnique({
      where: { id: attempt.bankId },
      select: { name: true, code: true },
    });
    if (bank) bankName = bank.name;
  }

  const mode = attempt.mode as ExamMode;
  const accuracy =
    attempt.totalCount === 0 || attempt.score === null
      ? '0.0'
      : attempt.score.toFixed(1);

  // 模考额外显示通过/未通过
  let passResult: { passed: boolean; threshold: number } | null = null;
  if (mode === 'MOCK' && attempt.bankId && attempt.score !== null) {
    const bank = await prisma.questionBank.findUnique({
      where: { id: attempt.bankId },
      select: { code: true },
    });
    const config = getMockConfig(bank?.code ?? '');
    passResult = {
      passed: attempt.score >= config.passScore,
      threshold: config.passScore,
    };
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">答题结果</h1>
        <p className="text-sm text-muted-foreground">
          {EXAM_MODE_DISPLAY[mode]} · {bankName}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>得分</span>
            {passResult && (
              <Badge variant={passResult.passed ? 'default' : 'destructive'}>
                {passResult.passed
                  ? `通过 (≥${passResult.threshold})`
                  : `未通过 (<${passResult.threshold})`}
              </Badge>
            )}
            {attempt.status === 'ABANDONED' && (
              <Badge variant="secondary">未完成</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold mb-4">
            {accuracy} <span className="text-base font-normal text-gray-500">分</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-500">总题数</div>
              <div className="font-mono text-lg">{attempt.totalCount}</div>
            </div>
            <div>
              <div className="text-gray-500">正确数</div>
              <div className="font-mono text-lg text-green-600">{attempt.correctCount}</div>
            </div>
            <div>
              <div className="text-gray-500">用时</div>
              <div className="font-mono text-lg">{formatDuration(attempt.durationMs)}</div>
            </div>
            <div>
              <div className="text-gray-500">开始时间</div>
              <div className="font-mono text-sm">
                {attempt.startedAt.toLocaleString('zh-CN')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href={`/exam/history/${attemptId}`}>查看逐题详情</Link>
        </Button>
        <Button asChild>
          <Link href="/exam">返回练习首页</Link>
        </Button>
      </div>
    </div>
  );
}
