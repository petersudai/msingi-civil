/**
 * Cloud accounts and backup are optional: the app is local-first and every
 * tool works with none of this configured. Server-side only (these variables
 * are secrets and are never sent to the browser).
 */
export function isCloudConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL &&
      process.env.NEON_AUTH_BASE_URL &&
      process.env.NEON_AUTH_COOKIE_SECRET,
  );
}
