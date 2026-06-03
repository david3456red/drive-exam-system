'use client';

import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { KeyRound, LogIn, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import { loginAction } from '@/app/actions/auth';

type LoginFormProps = {
  title: string;
  loginEntry: 'student' | 'admin';
  error?: string;
  notice?: string;
};

export function LoginForm({ title, loginEntry, error, notice }: LoginFormProps) {
  const [deviceId, setDeviceId] = useState('');
  const [deviceError, setDeviceError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadDevice() {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        if (mounted) setDeviceId(result.visitorId);
      } catch {
        if (!mounted) return;
        const fallback = `${navigator.userAgent}:${navigator.language}:${screen.width}x${screen.height}`;
        if (fallback.length > 16) {
          setDeviceId(btoa(unescape(encodeURIComponent(fallback))).slice(0, 48));
        } else {
          setDeviceError('设备指纹计算失败，请刷新后重试');
        }
      }
    }
    void loadDevice();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <form action={loginAction} className="login-panel stack">
      <div>
        <h1>{title}</h1>
        <p className="muted">请输入账号密码，系统会记录设备用于异地登录风控。</p>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}
      {deviceError ? <div className="error">{deviceError}</div> : null}
      <input type="hidden" name="deviceId" value={deviceId} />
      <input type="hidden" name="loginEntry" value={loginEntry} />
      <div className="field">
        <label htmlFor="username">
          <UserRound size={15} aria-hidden="true" />
          用户名
        </label>
        <input id="username" name="username" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">
          <KeyRound size={15} aria-hidden="true" />
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <button type="submit" className="primary" disabled={!deviceId}>
        <LogIn size={17} aria-hidden="true" />
        {deviceId ? '登录' : '正在识别设备'}
      </button>
    </form>
  );
}
