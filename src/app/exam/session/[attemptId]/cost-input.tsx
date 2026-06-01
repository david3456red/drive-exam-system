'use client';

import { useEffect, useRef } from 'react';

export function CostInput() {
  const startedAtRef = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (!input || !form) return;

    const onSubmit = () => {
      input.value = String(Math.max(0, Date.now() - startedAtRef.current));
    };

    form.addEventListener('submit', onSubmit);
    return () => {
      form.removeEventListener('submit', onSubmit);
    };
  }, []);

  return <input ref={inputRef} type="hidden" name="costMs" defaultValue="0" />;
}
