import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/app/login/login-form';

vi.mock('@/app/actions/auth', () => ({
  loginAction: '/login',
}));

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: {
    load: vi.fn(async () => ({
      get: vi.fn(async () => ({ visitorId: 'device_test' })),
    })),
  },
}));

describe('LoginForm', () => {
  it('submits the admin login entry for the admin page', async () => {
    render(<LoginForm title="后台登录" loginEntry="admin" />);

    await screen.findByRole('button', { name: '登录' });
    expect(screen.getByDisplayValue('admin')).toHaveAttribute('name', 'loginEntry');
  });

  it('submits the student login entry for the student page', async () => {
    render(<LoginForm title="学生登录" loginEntry="student" />);

    await screen.findByRole('button', { name: '登录' });
    expect(screen.getByDisplayValue('student')).toHaveAttribute('name', 'loginEntry');
  });
});
