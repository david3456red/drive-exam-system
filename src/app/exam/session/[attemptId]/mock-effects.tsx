'use client';

import { useEffect, useRef, useState } from 'react';

type MockEffectsProps = {
  attemptId: string;
  expiresAt: string;
};

export function MockEffects({ attemptId, expiresAt }: MockEffectsProps) {
  const suppressUnloadBeaconRef = useRef(false);
  const resetTimerRef = useRef<number | null>(null);
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

    const onSubmit = () => {
      suppressUnloadBeaconRef.current = true;
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        suppressUnloadBeaconRef.current = false;
        resetTimerRef.current = null;
      }, 5000);
    };

    const onBeforeUnload = () => {
      if (suppressUnloadBeaconRef.current) return;
      navigator.sendBeacon(
        '/api/exam/abandon',
        JSON.stringify({ attemptId }),
      );
    };
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.clearInterval(tick);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      document.removeEventListener('submit', onSubmit, true);
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
