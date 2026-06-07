import type { AnswerCardItem, AnswerCardOutcome } from '@/lib/exam-engine/answer-card';

type AnswerCardProps = {
  attemptId: string;
  items: AnswerCardItem[];
  action: string | ((formData: FormData) => Promise<void> | void);
};

export function AnswerCard({ attemptId, items, action }: AnswerCardProps) {
  const answeredCount = items.filter((item) => item.answered).length;

  return (
    <aside className="answer-card panel stack" aria-label="答题卡">
      <div className="answer-card-head">
        <div>
          <h2>答题卡</h2>
          <p className="muted">
            已答 {answeredCount} / {items.length}
          </p>
        </div>
      </div>
      <form action={action as string} aria-label="图形答题卡" className="answer-card-grid" role="group">
        <input type="hidden" name="attemptId" value={attemptId} />
        {items.map((item) => (
          <button
            aria-current={item.current ? 'step' : undefined}
            aria-label={`第 ${item.number} 题，${answerCardText(item)}`}
            className={[
              'answer-card-cell',
              `answer-card-cell-${item.outcome}`,
              item.current ? 'answer-card-cell-current' : '',
            ].filter(Boolean).join(' ')}
            key={item.questionId}
            name="questionId"
            type="submit"
            value={item.questionId}
          >
            {item.number}
          </button>
        ))}
      </form>
      <div className="answer-card-legend" aria-hidden="true">
        <span>
          <i className="answer-card-dot answer-card-cell-current" />
          当前
        </span>
        <span>
          <i className="answer-card-dot answer-card-cell-correct" />
          正确
        </span>
        <span>
          <i className="answer-card-dot answer-card-cell-wrong" />
          错误
        </span>
        <span>
          <i className="answer-card-dot answer-card-cell-answered" />
          已答
        </span>
        <span>
          <i className="answer-card-dot answer-card-cell-empty" />
          未答
        </span>
      </div>
    </aside>
  );
}

function answerCardText(item: AnswerCardItem): string {
  const outcome = answerCardOutcomeText(item.outcome);
  return item.current ? `当前试题，${outcome}` : outcome;
}

function answerCardOutcomeText(outcome: AnswerCardOutcome): string {
  switch (outcome) {
    case 'correct':
      return '回答正确';
    case 'wrong':
      return '回答错误';
    case 'answered':
      return '已答';
    case 'empty':
      return '未答';
  }
}
