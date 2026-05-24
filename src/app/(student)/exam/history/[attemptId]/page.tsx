/**
 * 学员答题记录详情页 `/exam/history/[attemptId]`
 *
 * Server Component,渲染单次会话(`ExamAttempt`)的逐题详情:
 *
 * - 校验归属:仅 `attempt.userId === session.user.id` 可查看,否则 404。
 * - 顶部概要:模式 + 题库名(`bankId` 为空显示"错题回顾")、状态徽标
 *   (`FINISHED → 已完成`、`ABANDONED → 未完成`)、总题数、正确数、
 *   正确率(一位小数)、用时 `mm:ss`、开始/结束时间。
 * - 下方逐题列表:按 `ExamRecord.answeredAt` 升序展示。每题渲染:
 *   - 题号 + 题型 Badge + 是否正确 Badge
 *   - 题干文本与可选图片
 *   - 选项列表:绿色高亮正确答案;若用户错选则红色高亮其选项
 *   - 用户答案 / 正确答案文字
 *   - 题目解析(若有)
 * - `ABANDONED` 会话仅展示已答过的题目(由 `ExamRecord` 数量自然决定),
 *   并通过状态 Badge 标注"未完成"——与需求 9.4 / 9.5 对齐。
 *
 * 仅渲染逻辑,不做任何写入;统计字段由 `finishSession` / `abandonSession`
 * 在结束时已写好,本页直接读取展示即可。
 */
import { auth } from '@/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { EXAM_MODE_DISPLAY, type ExamMode } from '@/lib/exam-engine/types';
import {
    parseOptions,
    QUESTION_TYPE_DISPLAY,
    type QuestionType,
} from '@/lib/question-types';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/** 把数字补零到 2 位,用于日期/时间格式化。 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 格式化为 `YYYY-MM-DD HH:mm`(本地时区)。 */
function formatDateTime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/** 把 `durationMs` 格式化为 `mm:ss`;`null` / 负数兜底为 `00:00`。 */
function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

/** 把整数 `score`(0-100) 渲染为带百分号的一位小数;`null` 返回 `-`。 */
function formatAccuracy(score: number | null): string {
  if (score == null) return '-';
  return `${score.toFixed(1)}%`;
}

export default async function HistoryDetailPage(props: {
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

  // 题库名(可选);WRONG_REVIEW 等无 bankId 的会话使用"错题回顾"占位。
  let bankName = '错题回顾';
  if (attempt.bankId) {
    const bank = await prisma.questionBank.findUnique({
      where: { id: attempt.bankId },
      select: { name: true },
    });
    if (bank) bankName = bank.name;
  }

  // 答题记录(逐题)。按答题时间升序展示,与会话推进顺序一致。
  // ABANDONED 会话天然只会查到"已答过的题目"。
  const records = await prisma.examRecord.findMany({
    where: { attemptId },
    orderBy: { answeredAt: 'asc' },
    include: {
      question: {
        select: {
          id: true,
          type: true,
          content: true,
          imageUrl: true,
          options: true,
          answer: true,
          explanation: true,
        },
      },
    },
  });

  const mode = attempt.mode as ExamMode;
  const accuracy = formatAccuracy(attempt.score);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/exam/history">← 返回答题记录</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <span>
              {EXAM_MODE_DISPLAY[mode]} · {bankName}
            </span>
            {attempt.status === 'FINISHED' && (
              <Badge variant="success">已完成</Badge>
            )}
            {attempt.status === 'ABANDONED' && (
              <Badge variant="muted">未完成</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">总题数</div>
              <div className="font-mono text-lg">{attempt.totalCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">正确数</div>
              <div className="font-mono text-lg text-green-600">
                {attempt.correctCount}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">正确率</div>
              <div className="font-mono text-lg">{accuracy}</div>
            </div>
            <div>
              <div className="text-muted-foreground">用时</div>
              <div className="font-mono text-lg">
                {formatDuration(attempt.durationMs)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">开始</div>
              <div className="font-mono text-xs">
                {formatDateTime(attempt.startedAt)}
              </div>
            </div>
            {attempt.finishedAt && (
              <div>
                <div className="text-muted-foreground">结束</div>
                <div className="font-mono text-xs">
                  {formatDateTime(attempt.finishedAt)}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          逐题详情({records.length})
        </h2>

        {records.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              该会话没有答题记录
            </CardContent>
          </Card>
        )}

        {records.map((r, i) => {
          const opts = parseOptions(r.question.options);
          // 多选/单选答案以字母拼接,统一大写后用集合判定高亮。
          const correctSet = new Set(
            r.question.answer.toUpperCase().split(''),
          );
          const userSet = new Set(r.userAnswer.toUpperCase().split(''));
          const qType = r.question.type as QuestionType;

          return (
            <Card key={r.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">第 {i + 1} 题</Badge>
                  <Badge variant="muted">{QUESTION_TYPE_DISPLAY[qType]}</Badge>
                  {r.isCorrect ? (
                    <Badge variant="success">✓ 正确</Badge>
                  ) : (
                    <Badge variant="destructive">✗ 错误</Badge>
                  )}
                </div>

                <div className="text-sm whitespace-pre-wrap">
                  {r.question.content}
                </div>

                {r.question.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.question.imageUrl}
                    alt="题图"
                    className="max-h-60 rounded border"
                  />
                )}

                {opts.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {opts.map((o) => {
                      const isCorrect = correctSet.has(o.key);
                      const isUserSelected = userSet.has(o.key);
                      const className =
                        'rounded border p-2 flex gap-2 ' +
                        (isCorrect
                          ? 'border-green-500 bg-green-50 '
                          : '') +
                        (!isCorrect && isUserSelected
                          ? 'border-red-500 bg-red-50 '
                          : '');
                      return (
                        <li key={o.key} className={className}>
                          <span className="font-mono font-semibold">
                            {o.key}.
                          </span>
                          <span className="flex-1">{o.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : qType === 'JUDGE' ? (
                  <div className="text-sm">
                    正确答案:
                    {r.question.answer.toUpperCase() === 'T'
                      ? '正确'
                      : '错误'}
                    <span className="mx-2">·</span>
                    你的答案:
                    {r.userAnswer.toUpperCase() === 'T'
                      ? '正确'
                      : r.userAnswer.toUpperCase() === 'F'
                        ? '错误'
                        : '(未作答)'}
                  </div>
                ) : null}

                <div className="text-xs text-muted-foreground">
                  你的答案:
                  <span className="font-mono">
                    {r.userAnswer || '(未作答)'}
                  </span>
                  <span className="mx-2">·</span>
                  正确答案:
                  <span className="font-mono">{r.question.answer}</span>
                </div>

                {r.question.explanation && (
                  <div className="text-sm text-gray-700 bg-gray-50 rounded p-2">
                    <div className="font-semibold mb-1">解析:</div>
                    <div className="whitespace-pre-wrap">
                      {r.question.explanation}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
