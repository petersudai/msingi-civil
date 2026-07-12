import type { SavedCalculation } from "@/lib/store/saved-calculations";
import { getSupabase } from "./client";

/**
 * Explicit cloud backup/restore for saved calculations.
 *
 * Deliberately not "magic" background sync: site connectivity is patchy, and
 * an engineer should know exactly when data moved. Backup pushes local
 * records up (upsert by id); restore pulls the account's records down and
 * merges them locally (newer updatedAt wins, handled by the store).
 */

interface CalculationRow {
  id: string;
  tool_slug: string;
  title: string;
  inputs: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export async function backupCalculations(
  items: SavedCalculation[],
): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud backup isn't configured in this build.");

  const rows = items.map((i) => ({
    id: i.id,
    tool_slug: i.toolSlug,
    title: i.title,
    inputs: i.inputs,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  }));

  const { error } = await supabase.from("saved_calculations").upsert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function restoreCalculations(): Promise<SavedCalculation[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud backup isn't configured in this build.");

  const { data, error } = await supabase
    .from("saved_calculations")
    .select("id, tool_slug, title, inputs, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data as CalculationRow[]).map((row) => ({
    id: row.id,
    toolSlug: row.tool_slug,
    title: row.title,
    inputs: row.inputs,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
