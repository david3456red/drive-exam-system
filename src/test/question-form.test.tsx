import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuestionForm, type QuestionFormInitialQuestion } from '@/app/admin/questions/question-form';

const banks = [
  { id: 'bank-1', name: 'Subject One' },
  { id: 'bank-2', name: 'Subject Four' },
];

const categories = [
  { id: 'cat-1', name: 'Road Signs' },
  { id: 'cat-2', name: 'Safety Rules' },
];

describe('QuestionForm', () => {
  it('does not hard-code multipart encoding on the question form', () => {
    const { container } = render(
      <QuestionForm action="/submit" banks={banks} categories={categories} mode="new" />,
    );

    expect(container.querySelector('form')).not.toHaveAttribute('enctype');
  });

  it('prefills an existing question and selected categories', () => {
    render(
      <QuestionForm
        action="/submit"
        banks={banks}
        categories={categories}
        mode="edit"
        initialQuestion={initialQuestion()}
        lockedScoringFields={false}
      />,
    );

    expect(screen.getByLabelText('题库')).toHaveValue('bank-2');
    expect(screen.getByLabelText('题型')).toHaveValue('MULTI');
    expect(screen.getByLabelText('题干')).toHaveValue('When should you signal?');
    expect(screen.getByLabelText('答案')).toHaveValue('AB');
    expect(screen.getByLabelText('选项 A')).toHaveValue('Before changing lanes');
    expect(screen.getByLabelText('选项 B')).toHaveValue('Before turning');
    expect(screen.getByText('当前图片：/uploads/questions/current.png')).toBeInTheDocument();
    expect(screen.getByLabelText('新图片 URL')).toHaveValue('');
    expect(screen.getByLabelText('上传新图片')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('移除当前图片')).not.toBeChecked();
    expect(screen.queryByRole('radio', { name: /使用 URL|上传替换|保留当前|移除图片/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('解析')).toHaveValue('Signal before moving.');
    expect(screen.getByLabelText('标签')).toHaveValue('signal|lane');
    expect(screen.getByLabelText('Safety Rules')).toBeChecked();
    expect(screen.getByLabelText('Road Signs')).not.toBeChecked();
  });

  it('disables scoring fields while leaving editable fields enabled for used questions', () => {
    render(
      <QuestionForm
        action="/submit"
        banks={banks}
        categories={categories}
        mode="edit"
        initialQuestion={initialQuestion()}
        lockedScoringFields
      />,
    );

    expect(screen.getByLabelText('题型')).toBeDisabled();
    expect(screen.getByLabelText('答案')).toBeDisabled();
    expect(screen.getByLabelText('选项 A')).toBeDisabled();
    expect(screen.getByLabelText('选项 B')).toBeDisabled();
    expect(screen.getByLabelText('题干')).not.toBeDisabled();
    expect(screen.getByLabelText('题库')).not.toBeDisabled();
    expect(screen.getByLabelText('Safety Rules')).not.toBeDisabled();
  });
});

function initialQuestion(): QuestionFormInitialQuestion {
  return {
    id: 'question-1',
    bankId: 'bank-2',
    type: 'MULTI',
    content: 'When should you signal?',
    imageUrl: '/uploads/questions/current.png',
    options: [
      { key: 'A', text: 'Before changing lanes' },
      { key: 'B', text: 'Before turning' },
    ],
    answer: 'AB',
    explanation: 'Signal before moving.',
    tags: ['signal', 'lane'],
    categoryIds: ['cat-2'],
  };
}
