export type LoginEntry = 'student' | 'admin';

export function readLoginEntry(value: FormDataEntryValue | null): LoginEntry {
  return value === 'admin' ? 'admin' : 'student';
}

export function loginFailurePath(entry: LoginEntry): '/login' | '/admin/login' {
  return entry === 'admin' ? '/admin/login' : '/login';
}
