import { isNoteTab, relIsUnder, sameTab, vaultNote } from "@/lib/noteRef";
import type { TabRef } from "@/lib/types";

/** Two notes shown side by side. Positions are stable; focus moves between them. */
export interface Split {
  left: TabRef;
  right: TabRef;
}

const inSplit = (split: Split, tab: TabRef) => sameTab(split.left, tab) || sameTab(split.right, tab);

/** Show `target` beside the focused tab. With a split already open, the side
 *  that is not focused is replaced. Only notes can be split. */
export function openAside(split: Split | null, focused: TabRef, target: TabRef): Split | null {
  if (!isNoteTab(focused) || !isNoteTab(target) || sameTab(focused, target)) return split;
  if (split && sameTab(split.left, focused) && inSplit(split, focused)) {
    return sameTab(split.right, target) ? split : { left: split.left, right: target };
  }
  if (split && sameTab(split.right, focused)) {
    return sameTab(split.left, target) ? split : { left: target, right: split.right };
  }
  return { left: focused, right: target };
}

/** Keep the split coherent when focus moves from `prev` to `next`: landing on
 *  the other side just refocuses; any other note replaces the side that was
 *  focused; the graph (or nothing) closes the split. */
export function followFocus(split: Split | null, prev: TabRef | null, next: TabRef | null): Split | null {
  if (!split) return null;
  if (!next || !isNoteTab(next)) return null;
  if (inSplit(split, next)) return split;
  if (prev && sameTab(split.left, prev)) return { left: next, right: split.right };
  if (prev && sameTab(split.right, prev)) return { left: split.left, right: next };
  return split;
}

/** The split collapses as soon as either side stops existing. */
export function dropFromSplit(split: Split | null, gone: (tab: TabRef) => boolean): Split | null {
  return split && !gone(split.left) && !gone(split.right) ? split : null;
}

/** Follow a rename/move of `rel` → `next` (note or folder). */
export function remapSplit(split: Split | null, rel: string, next: string): Split | null {
  if (!split) return null;
  const map = (tab: TabRef): TabRef => {
    if (tab.kind !== "vault") return tab;
    if (tab.rel === rel) return vaultNote(next);
    return tab.rel.startsWith(`${rel}/`) ? vaultNote(next + tab.rel.slice(rel.length)) : tab;
  };
  return { left: map(split.left), right: map(split.right) };
}

export const tabIsUnder = (tab: TabRef, rel: string) => tab.kind === "vault" && relIsUnder(tab.rel, rel);
