'use client';

import { useState } from 'react';

type QuestionImageProps = {
  src: string;
};

export function QuestionImage({ src }: QuestionImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="question-image-fallback" role="status">
        <span className="image-fallback-mark" aria-hidden="true" />
        <strong>图片加载失败</strong>
        <span className="muted">可以继续答题，稍后检查题库图片地址。</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 题图 URL 来自题库数据,不适合枚举 next/image remotePatterns。
    <img
      className="question-image"
      src={src}
      alt="题目配图"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
