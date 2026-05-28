import { NextResponse } from 'next/server';

import { finalizeAttempt } from '@/app/exam/actions';
import { getCurrentUser } from '@/lib/server-session';

export async function POST(request: Request) {
  const user = getCurrentUser();
  if (!user) return new NextResponse(null, { status: 204 });

  let attemptId = '';
  try {
    const text = await request.text();
    const body = JSON.parse(text) as { attemptId?: unknown };
    attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  if (attemptId) {
    await finalizeAttempt(attemptId, user.id, 'ABANDONED');
  }

  return new NextResponse(null, { status: 204 });
}
