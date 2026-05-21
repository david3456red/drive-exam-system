import {
  LayoutDashboard,
  BookOpen,
  BookmarkX,
  History,
  Library,
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

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: '工作台', icon: LayoutDashboard, permission: null, group: '主页' },

  { href: '/exam', label: '答题练习', icon: BookOpen, permission: 'exam:practice', group: '学习' },
  { href: '/exam/wrong', label: '错题本', icon: BookmarkX, permission: 'exam:practice', group: '学习' },
  { href: '/exam/history', label: '答题记录', icon: History, permission: 'stats:self', group: '学习' },

  { href: '/questions', label: '题库管理', icon: Library, permission: 'question:read', group: '题库' },

  { href: '/admin/users', label: '用户管理', icon: Users, permission: 'user:read', group: '系统' },
  { href: '/admin/roles', label: '角色权限', icon: Shield, permission: 'role:read', group: '系统' },
  { href: '/admin/login-logs', label: '登录日志', icon: ScrollText, permission: 'system:login_log', group: '系统' },
];
