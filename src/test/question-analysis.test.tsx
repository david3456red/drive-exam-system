import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuestionAnalysis } from '@/components/question-analysis';

describe('QuestionAnalysis', () => {
  it('reveals the answer and explanation on demand', () => {
    render(<QuestionAnalysis answer="C" explanation="观察交警手势后选择变道信号。" />);

    expect(screen.queryByLabelText('题目分析')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看分析' }));

    expect(screen.getByLabelText('题目分析')).toHaveTextContent('正确答案：C');
    expect(screen.getByLabelText('题目分析')).toHaveTextContent('文字说明：观察交警手势后选择变道信号。');
    expect(screen.getByRole('button', { name: '收起分析' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('uses a fallback when the question has no explanation', () => {
    render(<QuestionAnalysis answer="T" explanation={null} />);

    fireEvent.click(screen.getByRole('button', { name: '查看分析' }));

    expect(screen.getByLabelText('题目分析')).toHaveTextContent('暂无解析');
  });
});
