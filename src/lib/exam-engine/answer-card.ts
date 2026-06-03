export type AnswerCardState = 'empty' | 'answered' | 'correct' | 'wrong' | 'current';

export type AnswerCardRecord = {
  questionId: string;
  isCorrect: boolean;
};

export type AnswerCardItem = {
  number: number;
  questionId: string;
  state: AnswerCardState;
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
    let state: AnswerCardState = 'empty';

    if (index === currentIndex) {
      state = 'current';
    } else if (record && revealCorrectness) {
      state = record.isCorrect ? 'correct' : 'wrong';
    } else if (record) {
      state = 'answered';
    }

    return {
      number: index + 1,
      questionId,
      state,
      answered,
    };
  });
}
