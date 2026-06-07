'use client';

import { useState } from 'react';
import { Maximize2, X } from 'lucide-react';

type QuestionImageProps = {
  src: string;
};

export function QuestionImage({ src }: QuestionImageProps) {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
    <>
      <button
        type="button"
        className="question-image-trigger"
        onClick={() => setExpanded(true)}
        aria-label="放大查看题目配图"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 题图 URL 来自题库数据,不适合枚举 next/image remotePatterns。 */}
        <img
          className="question-image"
          src={src}
          alt="题目配图"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
        <span className="question-image-zoom" aria-hidden="true">
          <Maximize2 size={16} />
        </span>
      </button>

      {expanded ? (
        <div
          className="question-image-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="题目配图"
          onClick={() => setExpanded(false)}
        >
          <button
            type="button"
            className="question-image-close"
            aria-label="关闭题目配图"
            onClick={() => setExpanded(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- 题图 URL 来自题库数据,不适合枚举 next/image remotePatterns。 */}
          <img
            className="question-image-full"
            src={src}
            alt="题目配图"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
