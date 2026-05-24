'use client';

import {
  LayoutDashboard,
  BookOpen,
  BookmarkX,
  History,
  Library,
  ListChecks,
  Tag,
  Users,
  Shield,
  ScrollText,
  Circle,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { IconKey } from '@/lib/nav-config';

const ICON_MAP: Record<IconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  bookOpen: BookOpen,
  bookmarkX: BookmarkX,
  history: History,
  library: Library,
  listChecks: ListChecks,
  tag: Tag,
  users: Users,
  shield: Shield,
  scrollText: ScrollText,
};

/** Render a Lucide icon by string key. Used by Sidebar / StudentShell. */
export function NavIcon({ iconKey, ...props }: { iconKey: IconKey } & LucideProps) {
  const Icon = ICON_MAP[iconKey] ?? Circle;
  return <Icon {...props} />;
}
