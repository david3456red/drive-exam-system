import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuestionImage } from '@/components/question-image';

describe('QuestionImage', () => {
  it('opens and closes an enlarged image preview', () => {
    render(<QuestionImage src="/uploads/questions/sign.png" />);

    fireEvent.click(screen.getByLabelText('放大查看题目配图'));

    expect(screen.getByRole('dialog', { name: '题目配图' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('关闭题目配图'));

    expect(screen.queryByRole('dialog', { name: '题目配图' })).not.toBeInTheDocument();
  });

  it('shows an accessible fallback when the image fails to load', () => {
    render(<QuestionImage src="https://example.test/missing.png" />);

    fireEvent.error(screen.getByAltText('题目配图'));

    expect(screen.queryByAltText('题目配图')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('图片加载失败');
  });
});
