import { create } from "zustand";
import { noteKey, sameNote, vaultNote } from "@/lib/noteRef";
import type { LinkRewrite, NoteRef } from "@/lib/types";

/**
 * Open note tabs, in strip order. Intentionally dumb: just the ordered list
 * of note references. Which tab is *active* is derived from `vault.view` — never stored
 * here — so the two can't drift apart.
 */
interface TabsState {
  tabs: NoteRef[];
  /** Bumped to ask a note's pane to scroll to top (e.g. opened via a link). */
  scrollTopReq: { key: string; nonce: number } | null;
  /** Bumped to ask a note's pane to scroll to and flash the block containing `text`. */
  revealReq: { key: string; text: string; nonce: number } | null;
  /** Bumped to ask a note's pane to scroll to and flash the heading `heading`. */
  headingRevealReq: { key: string; heading: string; nonce: number } | null;
  /** Bumped to ask a newly created note to select its title. */
  titleFocusReq: { key: string; nonce: number } | null;
  /**
   * Bumped after the backend rewrote links on disk; every live pane re-points
   * link marks matching these rel pairs so editor content follows the disk.
   */
  linkRewritesReq: { rewrites: LinkRewrite[]; nonce: number } | null;
  /** Add a tab for `rel` if not already open (no-op otherwise). */
  open: (note: NoteRef) => void;
  close: (note: NoteRef) => void;
  closeMany: (notes: NoteRef[]) => void;
  /** Replace a note reference in place after its path changes. */
  replace: (note: NoteRef, next: NoteRef) => void;
  /** Rewrite rels after a rename/move of `rel` → `next` (note or folder). */
  remap: (rel: string, next: string) => void;
  /** Drop `rel` and anything under it (folder delete). */
  removeUnder: (rel: string) => void;
  /** Request that `rel`'s pane jump to the top on next render. */
  requestScrollTop: (note: NoteRef) => void;
  /** Request that `note`'s pane scroll to the first block containing `text`. */
  requestReveal: (note: NoteRef, text: string) => void;
  /** Request that `note`'s pane scroll to and flash the heading `heading`. */
  requestHeadingReveal: (note: NoteRef, heading: string) => void;
  /** Request that `rel`'s title input receive focus and select its text. */
  requestTitleFocus: (note: NoteRef) => void;
  /** Broadcast link rewrites (from a rename/move) to all live panes. */
  applyLinkRewrites: (rewrites: LinkRewrite[]) => void;
  clear: () => void;
}

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  scrollTopReq: null,
  revealReq: null,
  headingRevealReq: null,
  titleFocusReq: null,
  linkRewritesReq: null,

  open: (note) => {
    if (!get().tabs.some((tab) => sameNote(tab, note))) {
      set({ tabs: [...get().tabs, note] });
    }
  },

  close: (note) =>
    set({ tabs: get().tabs.filter((tab) => !sameNote(tab, note)) }),

  closeMany: (notes) => {
    const closing = new Set(notes.map(noteKey));
    set({ tabs: get().tabs.filter((tab) => !closing.has(noteKey(tab))) });
  },

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

  requestReveal: (note, text) =>
    set({
      revealReq: {
        key: noteKey(note),
        text,
        nonce: (get().revealReq?.nonce ?? 0) + 1,
      },
    }),

  requestTitleFocus: (note) =>
    set({
      titleFocusReq: {
        key: noteKey(note),
        nonce: (get().titleFocusReq?.nonce ?? 0) + 1,
      },
    }),

  requestHeadingReveal: (note, heading) =>
    set({
      headingRevealReq: {
        key: noteKey(note),
        heading,
        nonce: (get().headingRevealReq?.nonce ?? 0) + 1,
      },
    }),

  applyLinkRewrites: (rewrites) => {
    if (!rewrites.length) return;
    set({
      linkRewritesReq: {
        rewrites,
        nonce: (get().linkRewritesReq?.nonce ?? 0) + 1,
      },
    });
  },

  clear: () =>
    set({
      tabs: [],
      scrollTopReq: null,
      revealReq: null,
      headingRevealReq: null,
      titleFocusReq: null,
      linkRewritesReq: null,
    }),
}));

/** Tab to activate after closing `rel`: right neighbor, else left, else none. */
export function nextAfterClose(tabs: NoteRef[], note: NoteRef): NoteRef | null {
  const index = tabs.findIndex((tab) => sameNote(tab, note));
  if (index === -1) return tabs[0] ?? null;
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}

export type BulkCloseScope = "left" | "right" | "others";

/** Resolve the tabs affected by a context-menu bulk close operation. */
export function tabsForBulkClose(
  tabs: NoteRef[],
  note: NoteRef,
  scope: BulkCloseScope,
): NoteRef[] {
  const index = tabs.findIndex((tab) => sameNote(tab, note));
  if (index === -1) return [];
  if (scope === "left") return tabs.slice(0, index);
  if (scope === "right") return tabs.slice(index + 1);
  return tabs.filter((tab) => !sameNote(tab, note));
}
