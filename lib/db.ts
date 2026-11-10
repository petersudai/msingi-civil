import { neon } from "@neondatabase/serverless";

/**
 * Neon Postgres over HTTP, which suits serverless functions: no connection
 * pool to manage and nothing held open between requests. Always pass values
 * through the tagged template so they are sent as parameters, never spliced
 * into the SQL text.
 */
export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL isn't set.");
  return neon(url);
}
