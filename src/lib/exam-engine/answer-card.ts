export type AnswerCardOutcome = 'empty' | 'answered' | 'correct' | 'wrong';

export type AnswerCardRecord = {
  questionId: string;
  isCorrect: boolean;
};

export type AnswerCardItem = {
  number: number;
  questionId: string;
  outcome: AnswerCardOutcome;
  current: boolean;
  answered: boolean;
};

export type BuildAnswerCardItemsInput = {
  order: readonly string[];
  records: readonly AnswerCardRecord[];
  currentIndex: number;
  revealCorrectness: boolean;
};

export function buildAnswerCardItems({
  order,
  records,
  currentIndex,
  revealCorrectness,
}: BuildAnswerCardItemsInput): AnswerCardItem[] {
  const recordByQuestionId = new Map(records.map((record) => [record.questionId, record]));

  return order.map((questionId, index) => {
    const record = recordByQuestionId.get(questionId);
    const answered = Boolean(record);
    let outcome: AnswerCardOutcome = 'empty';

    if (record && revealCorrectness) {
      outcome = record.isCorrect ? 'correct' : 'wrong';
    } else if (record) {
      outcome = 'answered';
    }

    return {
      number: index + 1,
      questionId,
      outcome,
      current: index === currentIndex,
      answered,
    };
  });
}
