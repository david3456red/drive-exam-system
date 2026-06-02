import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuestionImage } from '@/components/question-image';

describe('QuestionImage', () => {
  it('shows an accessible fallback when the image fails to load', () => {
    render(<QuestionImage src="https://example.test/missing.png" />);

    fireEvent.error(screen.getByAltText('题目配图'));

    expect(screen.queryByAltText('题目配图')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('图片加载失败');
  });
});
