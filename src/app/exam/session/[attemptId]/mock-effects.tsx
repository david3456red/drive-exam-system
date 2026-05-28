'use client';

import { useEffect, useState } from 'react';

type MockEffectsProps = {
  attemptId: string;
  expiresAt: string;
};

export function MockEffects({ attemptId, expiresAt }: MockEffectsProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    const tick = window.setInterval(() => {
      const next = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemainingMs(next);
      if (next === 0) {
        window.clearInterval(tick);
        void fetch('/api/exam/abandon', {
          method: 'POST',
          body: JSON.stringify({ attemptId }),
          keepalive: true,
        }).finally(() => {
          window.location.href = `/exam/session/${attemptId}/result`;
        });
      }
    }, 1000);

    const onBeforeUnload = () => {
      navigator.sendBeacon(
        '/api/exam/abandon',
        JSON.stringify({ attemptId }),
      );
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [attemptId, expiresAt]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    <span className="badge bad" aria-live="polite">
      剩余 {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </span>
  );
}
