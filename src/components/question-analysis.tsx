'use client';

import { Eye, EyeOff, Lightbulb } from 'lucide-react';
import { useState } from 'react';

type QuestionAnalysisProps = {
  answer: string;
  explanation?: string | null;
};

export function QuestionAnalysis({ answer, explanation }: QuestionAnalysisProps) {
  const [open, setOpen] = useState(false);
  const text = explanation?.trim() || '暂无解析';

  return (
    <div className="question-analysis stack">
      <button
        type="button"
        className="button question-analysis-button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        {open ? '收起解析' : '查看解析'}
      </button>

      {open ? (
        <section className="analysis-panel stack" aria-label="题目解析">
          <span className="badge warn">
            <Lightbulb size={15} aria-hidden="true" />
            题目解析
          </span>
          <p>
            <strong>正确答案：</strong>
            {answer}
          </p>
          <p>
            <strong>文字说明：</strong>
            {text}
          </p>
        </section>
      ) : null}
    </div>
  );
}
