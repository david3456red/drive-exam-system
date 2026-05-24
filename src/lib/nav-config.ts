/**
 * Navigation config -- pure serializable data only.
 *
 * IMPORTANT: do NOT put React component references (LucideIcon, etc.) here.
 * These items are filtered in server components (layout.tsx) and passed as
 * props to client components (Sidebar / StudentShell). Next.js refuses to
 * serialize component references across that boundary; instead we pass an
 * `iconKey` string and the client component maps it to a Lucide icon.
 */

export type IconKey =
  | 'dashboard'
  | 'bookOpen'
  | 'bookmarkX'
  | 'history'
  | 'library'
  | 'listChecks'
  | 'users'
  | 'shield'
  | 'scrollText';

export type NavItem = {
  href: string;
  label: string;
  iconKey: IconKey;
  /** Permission code required (null = always visible to logged-in users) */
  permission: string | null;
  group?: string;
};

/** Student-facing portal (mobile-friendly tabs). */
export const STUDENT_NAV: NavItem[] = [
  { href: '/exam', label: '答题练习', iconKey: 'bookOpen', permission: 'exam:practice' },
  { href: '/exam/wrong', label: '错题本', iconKey: 'bookmarkX', permission: 'exam:practice' },
  { href: '/exam/history', label: '答题记录', iconKey: 'history', permission: 'stats:self' },
];

/** Admin / teacher portal (sidebar). */
export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: '工作台', iconKey: 'dashboard', permission: null, group: '主页' },

  { href: '/admin/banks', label: '题库', iconKey: 'library', permission: 'bank:read', group: '内容' },
  { href: '/admin/questions', label: '题目', iconKey: 'listChecks', permission: 'question:read', group: '内容' },

  { href: '/admin/users', label: '用户', iconKey: 'users', permission: 'user:read', group: '系统' },
  { href: '/admin/roles', label: '角色权限', iconKey: 'shield', permission: 'role:read', group: '系统' },
  { href: '/admin/login-logs', label: '登录日志', iconKey: 'scrollText', permission: 'system:login_log', group: '系统' },
];
