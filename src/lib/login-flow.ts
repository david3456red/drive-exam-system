export type LoginEntry = 'student' | 'admin';

export function isStudentRole(roleCode: string): boolean {
  return roleCode === 'student_strict' || roleCode === 'student_normal';
}

export function isStaffRole(roleCode: string): boolean {
  return ['super_admin', 'admin', 'teacher'].includes(roleCode);
}

export function canUsePublicPracticeLinks(roleCode: string | null | undefined): boolean {
  return !roleCode || isStudentRole(roleCode);
}

export function readLoginEntry(value: FormDataEntryValue | null): LoginEntry {
  return value === 'admin' ? 'admin' : 'student';
}

export function loginFailurePath(entry: LoginEntry): '/login' | '/admin/login' {
  return entry === 'admin' ? '/admin/login' : '/login';
}

export function loginSuccessPath(
  entry: LoginEntry,
  roleCode: string,
): '/exam' | '/admin' | null {
  if (entry === 'admin') return isStaffRole(roleCode) ? '/admin' : null;
  return isStudentRole(roleCode) ? '/exam' : null;
}
