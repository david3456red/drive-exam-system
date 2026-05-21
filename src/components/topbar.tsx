'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { LogOut, Menu, User } from 'lucide-react';
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
  name,
  username,
  roleName,
  onToggleSidebar,
}: {
  name: string;
  username: string;
  roleName: string;
  onToggleSidebar: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="font-semibold text-lg">驾考答题系统</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{name}</span>
          <span className="text-muted-foreground">@{username}</span>
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
        <Button
          variant="outline"
          size="sm"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            signOut({ callbackUrl: '/login' });
          }}
        >
          <LogOut className="h-4 w-4 mr-1" />
          {signingOut ? '退出中...' : '退出'}
        </Button>
      </div>
    </header>
  );
}
