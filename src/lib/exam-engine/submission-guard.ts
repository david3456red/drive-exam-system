export type SubmittedQuestionResolution =
  | { ok: true; index: number }
  | { ok: false; reason: 'QUESTION_NOT_IN_ATTEMPT' };

export function resolveSubmittedQuestion(
  questionOrder: readonly string[],
  questionId: string,
): SubmittedQuestionResolution {
  const index = questionOrder.indexOf(questionId);
  if (!questionId || index < 0) {
    return { ok: false, reason: 'QUESTION_NOT_IN_ATTEMPT' };
  }
  return { ok: true, index };
}
