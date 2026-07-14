import { create } from "zustand";
import { noteKey, sameNote, vaultNote } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";

/**
 * Open note tabs, in strip order. Intentionally dumb: just the ordered list
 * of note references. Which tab is *active* is derived from `vault.view` — never stored
 * here — so the two can't drift apart.
 */
interface TabsState {
  tabs: NoteRef[];
  /** Bumped to ask a note's pane to scroll to top (e.g. opened via a link). */
  scrollTopReq: { key: string; nonce: number } | null;
  /** Bumped to ask a newly created note to select its title. */
  titleFocusReq: { key: string; nonce: number } | null;
  /** Add a tab for `rel` if not already open (no-op otherwise). */
  open: (note: NoteRef) => void;
  close: (note: NoteRef) => void;
  /** Replace a note reference in place after its path changes. */
  replace: (note: NoteRef, next: NoteRef) => void;
  /** Rewrite rels after a rename/move of `rel` → `next` (note or folder). */
  remap: (rel: string, next: string) => void;
  /** Drop `rel` and anything under it (folder delete). */
  removeUnder: (rel: string) => void;
  /** Request that `rel`'s pane jump to the top on next render. */
  requestScrollTop: (note: NoteRef) => void;
  /** Request that `rel`'s title input receive focus and select its text. */
  requestTitleFocus: (note: NoteRef) => void;
  clear: () => void;
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  scrollTopReq: null,
  titleFocusReq: null,

  open: (note) => {
    if (!get().tabs.some((tab) => sameNote(tab, note))) {
      set({ tabs: [...get().tabs, note] });
    }
  },

  close: (note) =>
    set({ tabs: get().tabs.filter((tab) => !sameNote(tab, note)) }),

  replace: (note, next) =>
    set({
      tabs: get().tabs.map((tab) => (sameNote(tab, note) ? next : tab)),
    }),

  remap: (rel, next) =>
    set({
      tabs: get().tabs.map((tab) => {
        if (tab.kind !== "vault") return tab;
        if (tab.rel === rel) return vaultNote(next);
        return tab.rel.startsWith(`${rel}/`)
          ? vaultNote(next + tab.rel.slice(rel.length))
          : tab;
      }),
    }),

  removeUnder: (rel) =>
    set({
      tabs: get().tabs.filter(
        (tab) =>
          tab.kind !== "vault" ||
          (tab.rel !== rel && !tab.rel.startsWith(`${rel}/`)),
      ),
    }),

  requestScrollTop: (note) =>
    set({
      scrollTopReq: {
        key: noteKey(note),
        nonce: (get().scrollTopReq?.nonce ?? 0) + 1,
      },
    }),

  requestTitleFocus: (note) =>
    set({
      titleFocusReq: {
        key: noteKey(note),
        nonce: (get().titleFocusReq?.nonce ?? 0) + 1,
      },
    }),

  clear: () => set({ tabs: [], scrollTopReq: null, titleFocusReq: null }),
}));

/** Tab to activate after closing `rel`: right neighbor, else left, else none. */
export function nextAfterClose(tabs: NoteRef[], note: NoteRef): NoteRef | null {
  const index = tabs.findIndex((tab) => sameNote(tab, note));
  if (index === -1) return tabs[0] ?? null;
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}
