'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { LogOut, Menu, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ROLE_DISPLAY: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  teacher: '教练',
  student_strict: '严格学员',
  student_normal: '普通学员',
};

export function Topbar({
  title,
  badge,
  name,
  username,
  roleName,
  onToggleSidebar,
}: {
  title: string;
  badge?: string;
  name: string;
  username: string;
  roleName: string;
  onToggleSidebar?: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-3 sm:px-4 sticky top-0 z-30">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onToggleSidebar && (
          <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="font-semibold text-base sm:text-lg truncate">{title}</div>
        {badge && (
          <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 text-sm">
          <span className="font-medium">{name}</span>
          <span className="text-muted-foreground text-xs">@{username}</span>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs',
              roleName === 'super_admin' ? 'bg-red-100 text-red-700' :
              roleName === 'admin' ? 'bg-orange-100 text-orange-700' :
              roleName === 'teacher' ? 'bg-blue-100 text-blue-700' :
              roleName === 'student_strict' ? 'bg-purple-100 text-purple-700' :
              'bg-gray-100 text-gray-700',
            )}
          >
            {ROLE_DISPLAY[roleName] ?? roleName}
          </span>
        </div>
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/change-password">
            <KeyRound className="h-4 w-4 mr-1" />
            修改密码
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon" className="sm:hidden">
          <Link href="/change-password" aria-label="修改密码">
            <KeyRound className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            signOut({ callbackUrl: '/' });
          }}
        >
          <LogOut className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">{signingOut ? '退出中...' : '退出'}</span>
        </Button>
      </div>
    </header>
  );
}
