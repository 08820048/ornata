import { create } from "zustand";
import {
  emptyHistory,
  pruneHistory,
  remapHistory,
  stepBack,
  stepForward,
  visit,
  type NavHistory,
} from "@/lib/navHistory";
import type { TabRef } from "@/lib/types";

interface NavState extends NavHistory {
  record: (tab: TabRef) => void;
  /** Move the cursor and return the tab to show (null when at the edge). */
  back: () => TabRef | null;
  forward: () => TabRef | null;
  remap: (rel: string, next: string) => void;
  removeUnder: (rel: string) => void;
  clear: () => void;
}

const snapshot = (s: NavState): NavHistory => ({ entries: s.entries, index: s.index });

export const useNav = create<NavState>((set, get) => ({
  ...emptyHistory,
  record: (tab) => set(visit(snapshot(get()), tab)),
  back: () => {
    const next = stepBack(snapshot(get()));
    if (next.index === get().index) return null;
    set(next);
    return next.entries[next.index];
  },
  forward: () => {
    const next = stepForward(snapshot(get()));
    if (next.index === get().index) return null;
    set(next);
    return next.entries[next.index];
  },
  remap: (rel, next) => set(remapHistory(snapshot(get()), rel, next)),
  removeUnder: (rel) => set(pruneHistory(snapshot(get()), rel)),
  clear: () => set(emptyHistory),
}));
