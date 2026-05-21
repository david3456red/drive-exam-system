/**
 * Extract a best-effort client IP from a Request's headers.
 *
 * Honors common proxy headers (Cloudflare, X-Forwarded-For, X-Real-IP).
 */
export function getClientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const xff = headers.get('x-forwarded-for');
  if (xff) {
    // first entry is the original client
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'unknown';
}
