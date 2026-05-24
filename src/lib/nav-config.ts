import {
  LayoutDashboard,
  BookOpen,
  BookmarkX,
  History,
  Library,
  ListChecks,
  Users,
  Shield,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission code required (null = always visible to logged-in users) */
  permission: string | null;
  group?: string;
};

/** Student-facing portal (mobile-friendly tabs). */
export const STUDENT_NAV: NavItem[] = [
  { href: '/exam', label: '答题练习', icon: BookOpen, permission: 'exam:practice' },
  { href: '/exam/wrong', label: '错题本', icon: BookmarkX, permission: 'exam:practice' },
  { href: '/exam/history', label: '答题记录', icon: History, permission: 'stats:self' },
];

/** Admin / teacher portal (sidebar). */
export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: '工作台', icon: LayoutDashboard, permission: null, group: '主页' },

  { href: '/admin/banks', label: '题库', icon: Library, permission: 'bank:read', group: '内容' },
  { href: '/admin/questions', label: '题目', icon: ListChecks, permission: 'question:read', group: '内容' },

  { href: '/admin/users', label: '用户', icon: Users, permission: 'user:read', group: '系统' },
  { href: '/admin/roles', label: '角色权限', icon: Shield, permission: 'role:read', group: '系统' },
  { href: '/admin/login-logs', label: '登录日志', icon: ScrollText, permission: 'system:login_log', group: '系统' },
];
