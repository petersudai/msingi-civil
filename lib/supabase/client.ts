import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Env-gated Supabase client.
 *
 * The app is local-first: everything works with no backend configured.
 * When NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set
 * (see .env.example and supabase/migrations), sign-in and cloud backup of
 * saved calculations light up automatically.
 */

let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cached = url && key ? createClient(url, key) : null;
  return cached;
}

export function isCloudConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
