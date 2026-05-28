export const SESSION_COOKIE_NAME = 'drive_exam_session';

export function homeForRole(roleCode: string): '/admin' | '/exam' {
  return roleCode === 'student_strict' || roleCode === 'student_normal'
    ? '/exam'
    : '/admin';
}
