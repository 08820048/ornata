import { create } from "zustand";
import { noteKey, sameTab, tabKey, vaultNote } from "@/lib/noteRef";
import {
  closePane,
  closeSplit,
  dropFromSplit,
  followFocus,
  initialPanes,
  maxPanesFor,
  openAside,
  pruneState,
  remapSplit,
  replaceInSplit,
  stepPane,
  swapWithNext,
  tabIsUnder,
  type PaneState,
  type Split,
  type StepDirection,
} from "@/lib/split";
import type { NavHistory } from "@/lib/navHistory";
import type { LinkRewrite, NoteRef, TabRef } from "@/lib/types";

/**
 * Open tabs, in strip order: notes, plus at most one graph tab.
 * Intentionally dumb: just the ordered list of tab references. Which tab is *active* is derived from `vault.view` — never stored
 * here — so the two can't drift apart.
 */
interface TabsState {
  tabs: TabRef[];
  /** Notes shown side by side, each pane with its own history. */
  split: Split | null;
  /** Back/forward history of the one pane when there is no split. */
  solo: NavHistory;
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
  /** Show `target` beside the focused tab, opening it if needed. */
  openAside: (focused: TabRef, target: TabRef) => void;
  /** Close the pane showing `tab` (the split ends when one pane is left). */
  closePane: (tab: TabRef) => void;
  /** End the split, keeping the pane showing `keep`. */
  closeSplit: (keep: TabRef | null) => void;
  /** Move the focused pane's history; returns the tab to show (the caller
   *  displays it without recording), or null at the edge. */
  step: (direction: StepDirection, focused: TabRef) => TabRef | null;
  /** Swap `tab`'s pane with its neighbour. */
  swapPane: (tab: TabRef) => void;
  setSplitSizes: (sizes: number[]) => void;
  /** Keep the split coherent when focus moves between tabs. */
  followFocus: (prev: TabRef | null, next: TabRef | null, record?: boolean) => void;
  /** Add a tab if not already open (no-op otherwise). */
  open: (tab: TabRef) => void;
  close: (tab: TabRef) => void;
  closeMany: (tabs: TabRef[]) => void;
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

export const useTabs = create<TabsState>((set, get) => {
  const panes = (): PaneState => ({ split: get().split, solo: get().solo });
  /** Apply a new layout; a no-op (same objects) doesn't notify anyone. */
  const apply = (next: PaneState, extra: Partial<TabsState> = {}) => {
    const now = panes();
    if (next.split === now.split && next.solo === now.solo && !Object.keys(extra).length) return;
    set({ split: next.split, solo: next.solo, ...extra });
  };

  return {
  tabs: [],
  split: null,
  solo: initialPanes.solo,
  scrollTopReq: null,
  revealReq: null,
  headingRevealReq: null,
  titleFocusReq: null,
  linkRewritesReq: null,

  open: (next) => {
    if (!get().tabs.some((tab) => sameTab(tab, next))) {
      set({ tabs: [...get().tabs, next] });
    }
  },

  openAside: (focused, target) => {
    const next = openAside(panes(), focused, target, maxPanesFor(window.innerWidth));
    if (next.split === get().split) return;
    get().open(target);
    apply(next);
  },

  closePane: (tab) => apply(closePane(panes(), tab)),

  closeSplit: (keep) => apply(closeSplit(panes(), keep)),

  swapPane: (tab) => apply(swapWithNext(panes(), tab)),

  step: (direction, focused) => {
    const moved = stepPane(panes(), focused, direction);
    if (!moved) return null;
    apply(moved.state);
    return moved.tab;
  },

  setSplitSizes: (sizes) => {
    const split = get().split;
    if (split && sizes.length === split.panes.length) set({ split: { ...split, sizes } });
  },

  followFocus: (prev, next, record = true) => apply(followFocus(panes(), prev, next, record)),

  close: (closing) =>
    apply(dropFromSplit(panes(), (tab) => sameTab(tab, closing)), {
      tabs: get().tabs.filter((tab) => !sameTab(tab, closing)),
    }),

  closeMany: (closingTabs) => {
    const closing = new Set(closingTabs.map(tabKey));
    apply(dropFromSplit(panes(), (tab) => closing.has(tabKey(tab))), {
      tabs: get().tabs.filter((tab) => !closing.has(tabKey(tab))),
    });
  },

  replace: (note, next) =>
    apply(replaceInSplit(panes(), note, next), {
      tabs: get().tabs.map((tab) => (sameTab(tab, note) ? next : tab)),
    }),

  remap: (rel, next) =>
    set({
      ...remapSplit(panes(), rel, next),
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
      ...pruneState(dropFromSplit(panes(), (tab) => tabIsUnder(tab, rel)), rel),
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
      split: null,
      solo: initialPanes.solo,
      scrollTopReq: null,
      revealReq: null,
      headingRevealReq: null,
          titleFocusReq: null,
      linkRewritesReq: null,
    }),
  };
});

/** Tab to activate after closing `closing`: right neighbor, else left, else none. */
export function nextAfterClose(tabs: TabRef[], closing: TabRef): TabRef | null {
  const index = tabs.findIndex((tab) => sameTab(tab, closing));
  if (index === -1) return tabs[0] ?? null;
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}

export type BulkCloseScope = "left" | "right" | "others";

/** Resolve the tabs affected by a context-menu bulk close operation. */
export function tabsForBulkClose(
  tabs: TabRef[],
  kept: TabRef,
  scope: BulkCloseScope,
): TabRef[] {
  const index = tabs.findIndex((tab) => sameTab(tab, kept));
  if (index === -1) return [];
  if (scope === "left") return tabs.slice(0, index);
  if (scope === "right") return tabs.slice(index + 1);
  return tabs.filter((tab) => !sameTab(tab, kept));
}
