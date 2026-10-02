import { create } from "zustand";
import type { RebarTakeoffFormValues } from "@/lib/calculations/rebar-takeoff/schema";

/**
 * One-shot hand-off between tools. A result in one tool can pre-fill the next
 * tool's form (beam design to rebar takeoff). Held in memory only: it exists
 * for the single navigation that follows, then the receiving form takes it.
 * Nothing is persisted, so a stale hand-off can never reappear later.
 */
interface HandoffState {
  rebar: Partial<RebarTakeoffFormValues> | null;
  setRebar: (values: Partial<RebarTakeoffFormValues>) => void;
  /** Returns the pending values and clears them. */
  takeRebar: () => Partial<RebarTakeoffFormValues> | null;
}

export const useHandoff = create<HandoffState>()((set, get) => ({
  rebar: null,
  setRebar: (values) => set({ rebar: values }),
  takeRebar: () => {
    const pending = get().rebar;
    if (pending) set({ rebar: null });
    return pending;
  },
}));
