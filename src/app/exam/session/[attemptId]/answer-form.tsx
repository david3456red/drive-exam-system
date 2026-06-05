import { Send } from 'lucide-react';

import { CostInput } from './cost-input';

type QuestionOption = {
  key: string;
  text: string;
};

type QuestionAnswerFormProps = {
  action?: string | ((formData: FormData) => Promise<void> | void);
  attemptId: string;
  currentAnswer?: string;
  options: QuestionOption[];
  questionId: string;
  questionType: string;
  submitLabel?: string;
};

export function QuestionAnswerForm({
  action = '/submit',
  attemptId,
  currentAnswer,
  options,
  questionId,
  questionType,
  submitLabel = '提交答案',
}: QuestionAnswerFormProps) {
  const isMulti = questionType === 'MULTI';

  return (
    <form action={action as string} className="stack" key={questionId}>
      <input type="hidden" name="attemptId" value={attemptId} />
      <input type="hidden" name="questionId" value={questionId} />
      <CostInput />
      {options.map((option) => (
        <label className="option" key={option.key}>
          <input
            defaultChecked={currentAnswer?.includes(option.key) ?? false}
            type={isMulti ? 'checkbox' : 'radio'}
            name="answer"
            value={option.key}
            required={!isMulti}
          />
          <strong>{option.key}</strong>
          <span>{option.text}</span>
        </label>
      ))}
      <button type="submit" className="primary">
        <Send size={17} aria-hidden="true" />
        {submitLabel}
      </button>
    </form>
  );
}
