/**
 * /api/exam/abandon
 *
 * Route Handler 用于配合 `navigator.sendBeacon()`:
 * 当模考学员关闭浏览器/导航到其它页面时,客户端通过 sendBeacon 发送
 * 请求,服务端将对应的会话标记为 `ABANDONED`(由 `abandonSession`
 * Server Action 完成实际写入)。
 *
 * 因为 Server Actions 不支持 `sendBeacon` 的 keep-alive 语义,所以单独
 * 提供此 Handler。
 *
 * 设计要点:
 * - 仅支持 POST 方法。
 * - 任何错误都不抛出未处理异常(影响 sendBeacon 客户端体验);统一返回
 *   204 No Content 即可。`sendBeacon` 没有重试机制,这里"尽力而为"。
 * - 入参容错:`sendBeacon` 默认 `Content-Type` 为 `text/plain`,少数情况
 *   下也可能是 `application/json`,因此先 `req.text()` 再尝试 `JSON.parse`,
 *   解析失败静默忽略。
 * - 鉴权:校验当前 session,未登录直接 204(无副作用)。
 * - 调用 `abandonSession` 失败也不暴露错误,直接 204——它内部已经做了
 *   归属校验和幂等处理。
 */
import { NextResponse } from 'next/server';

import { abandonSession } from '@/app/(student)/exam/actions';
import { auth } from '@/auth';

export async function POST(req: Request): Promise<NextResponse> {
  // 1. 解析请求体。sendBeacon 默认 Content-Type 是 text/plain,
  //    用 req.text() 然后手动 JSON.parse 兼容性最好。
  let attemptId: string | undefined;
  try {
    const text = await req.text();
    if (text) {
      const parsed: unknown = JSON.parse(text);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'attemptId' in parsed &&
        typeof (parsed as { attemptId: unknown }).attemptId === 'string' &&
        (parsed as { attemptId: string }).attemptId.length > 0
      ) {
        attemptId = (parsed as { attemptId: string }).attemptId;
      }
    }
  } catch {
    // 解析失败:静默忽略,直接走到 204 分支。
  }

  if (!attemptId) {
    return new NextResponse(null, { status: 204 });
  }

  // 2. 校验当前 session;没有 session 直接 204(无副作用)。
  const session = await auth();
  if (!session?.user) {
    return new NextResponse(null, { status: 204 });
  }

  // 3. 调用 Server Action;失败也保持 204——sendBeacon 没有重试机制,
  //    暴露错误反而会污染浏览器控制台。归属与幂等已由 abandonSession 内部
  //    处理。
  try {
    await abandonSession(attemptId);
  } catch {
    // 任何异常都吞掉,统一 204。
  }

  return new NextResponse(null, { status: 204 });
}
