import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Saved calculations — local-first.
 *
 * Everything persists to localStorage immediately (site connectivity is
 * unreliable; saving must never depend on the network). When the user signs
 * in to a configured Supabase backend, the same records back up to the cloud
 * via `lib/supabase/sync.ts`. IDs are UUIDs so local and cloud copies merge
 * cleanly.
 */

export interface SavedCalculation {
  id: string;
  toolSlug: string;
  /** Human title, e.g. "Class 20 (1:2:4) · 6 m³". */
  title: string;
  /** Raw form values (strings) — reloaded straight into the tool's form. */
  inputs: Record<string, string>;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
}

interface SavedCalculationsState {
  items: SavedCalculation[];
  save: (item: Pick<SavedCalculation, "toolSlug" | "title" | "inputs">) => SavedCalculation;
  remove: (id: string) => void;
  /** Merge records from the cloud: newer `updatedAt` wins per id. */
  merge: (incoming: SavedCalculation[]) => void;
}

export const useSavedCalculations = create<SavedCalculationsState>()(
  persist(
    (set, get) => ({
      items: [],
      save: (item) => {
        const now = new Date().toISOString();
        const record: SavedCalculation = {
          id: crypto.randomUUID(),
          ...item,
          createdAt: now,
          updatedAt: now,
        };
        set({ items: [record, ...get().items] });
        return record;
      },
      remove: (id) => {
        set({ items: get().items.filter((i) => i.id !== id) });
      },
      merge: (incoming) => {
        const byId = new Map(get().items.map((i) => [i.id, i]));
        for (const record of incoming) {
          const existing = byId.get(record.id);
          if (!existing || record.updatedAt > existing.updatedAt) {
            byId.set(record.id, record);
          }
        }
        const merged = [...byId.values()].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        );
        set({ items: merged });
      },
    }),
    { name: "msingi-saved-calculations" },
  ),
);
