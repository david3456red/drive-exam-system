export function redirectMessagePath(
  path: string,
  key: 'error' | 'notice',
  message: string,
): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${key}=${encodeURIComponent(message)}`;
}
