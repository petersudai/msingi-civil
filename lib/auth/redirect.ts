/**
 * Only allow a post-sign-in redirect to a path inside this app. Anything else
 * (another site, a protocol-relative "//host", a backslash trick, a control
 * character that browsers strip) falls back to the account page.
 */
export function safeNextPath(next: string | null | undefined): string {
  const fallback = "/account";
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  return next;
}
