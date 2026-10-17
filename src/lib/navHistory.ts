import { relIsUnder, sameTab, vaultNote } from "@/lib/noteRef";
import type { TabRef } from "@/lib/types";

/** Back/forward trail of visited tabs, browser-style. Pure and immutable. */
export interface NavHistory {
  entries: TabRef[];
  index: number;
}

export const MAX_NAV_ENTRIES = 50;

export const emptyHistory: NavHistory = { entries: [], index: -1 };

export const canGoBack = (h: NavHistory) => h.index > 0;
export const canGoForward = (h: NavHistory) => h.index < h.entries.length - 1;

/** Visit `tab`: drops the forward trail; revisiting the current tab is a no-op. */
export function visit(h: NavHistory, tab: TabRef): NavHistory {
  const current = h.entries[h.index];
  if (current && sameTab(current, tab)) return h;
  let entries = [...h.entries.slice(0, h.index + 1), tab];
  if (entries.length > MAX_NAV_ENTRIES) {
    entries = entries.slice(entries.length - MAX_NAV_ENTRIES);
  }
  return { entries, index: entries.length - 1 };
}

export function stepBack(h: NavHistory): NavHistory {
  return canGoBack(h) ? { ...h, index: h.index - 1 } : h;
}

export function stepForward(h: NavHistory): NavHistory {
  return canGoForward(h) ? { ...h, index: h.index + 1 } : h;
}

/** Follow a rename/move of `rel` → `next` (note or folder). */
export function remapHistory(h: NavHistory, rel: string, next: string): NavHistory {
  const entries = h.entries.map((tab): TabRef => {
    if (tab.kind !== "vault") return tab;
    if (tab.rel === rel) return vaultNote(next);
    return tab.rel.startsWith(`${rel}/`) ? vaultNote(next + tab.rel.slice(rel.length)) : tab;
  });
  return { ...h, entries };
}

/** Forget `rel` and anything under it (delete), keeping the cursor on the
 *  nearest surviving entry and collapsing neighbours that became identical. */
export function pruneHistory(h: NavHistory, rel: string): NavHistory {
  const entries: TabRef[] = [];
  let index = -1;
  h.entries.forEach((tab, i) => {
    if (tab.kind === "vault" && relIsUnder(tab.rel, rel)) return;
    const last = entries[entries.length - 1];
    if (!last || !sameTab(last, tab)) entries.push(tab);
    if (i <= h.index) index = entries.length - 1;
  });
  return { entries, index: entries.length ? Math.max(index, 0) : -1 };
}
