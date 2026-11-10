import { createNeonAuth } from "@neon/auth/next/server";
import { isCloudConfigured } from "@/lib/cloud/config";

/**
 * Neon Auth (managed Better Auth) for the whole app. Null when the cloud
 * variables aren't set, so callers must handle "no accounts in this build".
 */
export const auth = isCloudConfigured()
  ? createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
    })
  : null;

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

/** The signed-in user, or null when signed out, not configured, or the auth server is unreachable. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!auth) return null;
  try {
    const { data } = await auth.getSession();
    const user = data?.user;
    if (!user) return null;
    return { id: user.id, email: user.email, name: user.name ?? "" };
  } catch {
    return null;
  }
}
