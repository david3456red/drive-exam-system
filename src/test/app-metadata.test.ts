import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions/auth', () => ({
  logoutAction: vi.fn(),
}));

vi.mock('@/components/app-shell', () => ({
  AppShellHeader: vi.fn(() => null),
}));

vi.mock('@/lib/server-session', () => ({
  getCurrentUser: vi.fn(() => null),
}));

describe('app metadata', () => {
  it('declares an existing favicon asset', async () => {
    const { metadata } = await import('@/app/layout');
    expect(metadata.icons).toEqual({ icon: '/favicon.svg' });

    const faviconPath = path.join(process.cwd(), 'public', 'favicon.svg');
    expect(existsSync(faviconPath)).toBe(true);
    expect(readFileSync(faviconPath, 'utf8')).toContain('<svg');
  });
});
