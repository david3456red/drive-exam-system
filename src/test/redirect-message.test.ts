import { describe, expect, it } from 'vitest';

import { redirectMessagePath } from '@/lib/redirect-message';

describe('redirectMessagePath', () => {
  it('encodes non-ASCII messages', () => {
    expect(redirectMessagePath('/exam', 'error', '章节练习至少选择一个分类')).toBe(
      `/exam?error=${encodeURIComponent('章节练习至少选择一个分类')}`,
    );
  });

  it('appends to existing query strings', () => {
    expect(redirectMessagePath('/admin/questions?page=2', 'notice', '题目已更新')).toBe(
      `/admin/questions?page=2&notice=${encodeURIComponent('题目已更新')}`,
    );
  });
});
