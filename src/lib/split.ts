import { isNoteTab, relIsUnder, sameTab, vaultNote } from "@/lib/noteRef";
import type { TabRef } from "@/lib/types";

/** Notes shown side by side, left to right, with their width fractions
 *  (always `panes.length` entries summing to 1). Focus moves between panes
 *  without moving them. */
export interface Split {
  panes: TabRef[];
  sizes: number[];
}

export const MAX_PANES = 4;
/** Narrowest a pane may be dragged to, in px. */
export const MIN_PANE_PX = 280;

const indexOf = (split: Split, tab: TabRef) => split.panes.findIndex((p) => sameTab(p, tab));

const evenSizes = (count: number) => Array.from({ length: count }, () => 1 / count);

/** How many panes fit side by side in `width` px. */
export const maxPanesFor = (width: number) =>
  Math.max(2, Math.min(MAX_PANES, Math.floor(width / (MIN_PANE_PX + 80))));

/** Show `target` right of the focused pane and share the width evenly again
 *  (drag a divider to deviate); at the cap it replaces the neighbour instead.
 *  Only notes can be split. */
export function openAside(
  split: Split | null,
  focused: TabRef,
  target: TabRef,
  maxPanes = MAX_PANES,
): Split | null {
  if (!isNoteTab(focused) || !isNoteTab(target) || sameTab(focused, target)) return split;
  if (!split || indexOf(split, focused) === -1) {
    return { panes: [focused, target], sizes: [0.5, 0.5] };
  }
  if (indexOf(split, target) !== -1) return split;
  const at = indexOf(split, focused);
  if (split.panes.length >= maxPanes) {
    const replace = at + 1 < split.panes.length ? at + 1 : at - 1;
    const panes = split.panes.slice();
    panes[replace] = target;
    return { panes, sizes: split.sizes };
  }
  const panes = split.panes.slice();
  panes.splice(at + 1, 0, target);
  return { panes, sizes: evenSizes(panes.length) };
}

/** Keep the split coherent when focus moves from `prev` to `next`: landing on
 *  another pane just refocuses; any other note replaces the pane that was
 *  focused; the graph (or nothing) closes the split. */
export function followFocus(split: Split | null, prev: TabRef | null, next: TabRef | null): Split | null {
  if (!split) return null;
  if (!next || !isNoteTab(next)) return null;
  if (indexOf(split, next) !== -1) return split;
  const at = prev ? indexOf(split, prev) : -1;
  // Focus arrived from outside the split (its pane was just closed): a note
  // with no pane would cover the others, so the split ends instead.
  if (at === -1) return null;
  const panes = split.panes.slice();
  panes[at] = next;
  return { panes, sizes: split.sizes };
}

/** The pane that should take focus when `tab`'s pane closes: the one to its
 *  left, or the one to its right for the first pane. */
export function neighbourOf(split: Split, tab: TabRef): TabRef | null {
  const at = indexOf(split, tab);
  if (at === -1) return null;
  return split.panes[at > 0 ? at - 1 : 1] ?? null;
}

/** Remove the pane showing `tab` and share the width evenly again. One
 *  remaining pane is no split at all. */
export function closePane(split: Split | null, tab: TabRef): Split | null {
  if (!split) return null;
  const at = indexOf(split, tab);
  if (at === -1) return split;
  if (split.panes.length <= 2) return null;
  const panes = split.panes.filter((_, i) => i !== at);
  return { panes, sizes: evenSizes(panes.length) };
}

/** Drop every pane whose tab no longer exists. */
export function dropFromSplit(split: Split | null, gone: (tab: TabRef) => boolean): Split | null {
  if (!split) return null;
  const keep = split.panes.map((tab) => !gone(tab));
  if (keep.every(Boolean)) return split;
  const panes = split.panes.filter((_, i) => keep[i]);
  if (panes.length < 2) return null;
  return { panes, sizes: evenSizes(panes.length) };
}

/** Follow a rename/move of `rel` → `next` (note or folder). */
export function remapSplit(split: Split | null, rel: string, next: string): Split | null {
  if (!split) return null;
  const map = (tab: TabRef): TabRef => {
    if (tab.kind !== "vault") return tab;
    if (tab.rel === rel) return vaultNote(next);
    return tab.rel.startsWith(`${rel}/`) ? vaultNote(next + tab.rel.slice(rel.length)) : tab;
  };
  return { panes: split.panes.map(map), sizes: split.sizes };
}

/** Swap tab references in place (external-note rename). */
export function replaceInSplit(split: Split | null, from: TabRef, to: TabRef): Split | null {
  if (!split) return null;
  return { panes: split.panes.map((p) => (sameTab(p, from) ? to : p)), sizes: split.sizes };
}

/** Drag the divider after pane `index` by `delta` (fraction of the total
 *  width), starting from `start` sizes; neither neighbour goes below `min`. */
export function resizeDivider(start: number[], index: number, delta: number, min: number): number[] {
  const sizes = start.slice();
  const pair = start[index] + start[index + 1];
  if (pair === undefined || Number.isNaN(pair)) return start;
  const floor = Math.min(min, pair / 2);
  const left = Math.min(Math.max(start[index] + delta, floor), pair - floor);
  sizes[index] = left;
  sizes[index + 1] = pair - left;
  return sizes;
}

export const tabIsUnder = (tab: TabRef, rel: string) => tab.kind === "vault" && relIsUnder(tab.rel, rel);
