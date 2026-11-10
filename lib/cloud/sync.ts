import type { SavedCalculation } from "@/lib/store/saved-calculations";

/**
 * Explicit cloud backup/restore for saved calculations.
 *
 * Deliberately not "magic" background sync: site connectivity is patchy, and
 * an engineer should know exactly when data moved. Backup pushes local
 * records up (upsert by id); restore pulls the account's records down and
 * merges them locally (newer updatedAt wins, handled by the store).
 */

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function backupCalculations(items: SavedCalculation[]): Promise<number> {
  const res = await fetch("/api/calculations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(await readError(res, "Backup failed. Try again."));
  const body = (await res.json()) as { saved: number };
  return body.saved;
}

export async function restoreCalculations(): Promise<SavedCalculation[]> {
  const res = await fetch("/api/calculations", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res, "Restore failed. Try again."));
  const body = (await res.json()) as { items: SavedCalculation[] };
  return body.items;
}
