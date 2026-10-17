import { isNoteTab, relIsUnder, sameTab, vaultNote } from "@/lib/noteRef";
import {
  emptyHistory,
  pruneHistory,
  remapHistory,
  stepBackSkipping,
  stepForwardSkipping,
  visit,
  type NavHistory,
} from "@/lib/navHistory";
import type { TabRef } from "@/lib/types";

/** Notes shown side by side, left to right, with their width fractions
 *  (always `panes.length` entries summing to 1) and each pane's own
 *  back/forward history. Focus moves between panes without moving them. */
export interface Split {
  panes: TabRef[];
  sizes: number[];
  histories: NavHistory[];
}

/** The whole pane layout: a split, or — when there is none — the single
 *  pane's history. Every operation below takes and returns one of these, so
 *  histories travel with their panes. */
export interface PaneState {
  split: Split | null;
  solo: NavHistory;
}

export const initialPanes: PaneState = { split: null, solo: emptyHistory };

export const MAX_PANES = 4;
/** Narrowest a pane may be dragged to, in px. */
export const MIN_PANE_PX = 280;

const indexOf = (split: Split, tab: TabRef) => split.panes.findIndex((p) => sameTab(p, tab));

const evenSizes = (count: number) => Array.from({ length: count }, () => 1 / count);

/** How many panes fit side by side in `width` px. */
export const maxPanesFor = (width: number) =>
  Math.max(2, Math.min(MAX_PANES, Math.floor(width / (MIN_PANE_PX + 80))));

/** The history of the pane showing `tab` (the solo one when there is no split). */
export function historyOf(state: PaneState, tab: TabRef | null): NavHistory {
  if (!state.split) return state.solo;
  const at = tab ? indexOf(state.split, tab) : -1;
  return at === -1 ? emptyHistory : state.split.histories[at];
}

/** What's left once the split is gone: one pane, carrying its history. */
const single = (history: NavHistory): PaneState => ({ split: null, solo: history });

/** Show `target` right of the focused pane and share the width evenly again
 *  (drag a divider to deviate); at the cap it replaces the neighbour instead.
 *  The new pane starts its own history. Only notes can be split. */
export function openAside(
  state: PaneState,
  focused: TabRef,
  target: TabRef,
  maxPanes = MAX_PANES,
): PaneState {
  if (!isNoteTab(focused) || !isNoteTab(target) || sameTab(focused, target)) return state;
  const { split } = state;
  const fresh = visit(emptyHistory, target);
  if (!split || indexOf(split, focused) === -1) {
    return {
      split: {
        panes: [focused, target],
        sizes: [0.5, 0.5],
        histories: [visit(state.solo, focused), fresh],
      },
      solo: emptyHistory,
    };
  }
  if (indexOf(split, target) !== -1) return state;
  const at = indexOf(split, focused);
  if (split.panes.length >= maxPanes) {
    const replace = at + 1 < split.panes.length ? at + 1 : at - 1;
    const panes = split.panes.slice();
    const histories = split.histories.slice();
    panes[replace] = target;
    histories[replace] = fresh;
    return { split: { ...split, panes, histories }, solo: state.solo };
  }
  const panes = split.panes.slice();
  const histories = split.histories.slice();
  panes.splice(at + 1, 0, target);
  histories.splice(at + 1, 0, fresh);
  return { split: { panes, sizes: evenSizes(panes.length), histories }, solo: state.solo };
}

/**
 * Keep the layout coherent when focus moves from `prev` to `next`.
 * - Landing on another pane only refocuses: nothing is recorded.
 * - Any other note replaces the pane that was focused, and is recorded in that
 *   pane's history (unless `record` is false: back/forward moved it already).
 * - The graph, nothing, or focus arriving from outside the split ends the split.
 * Without a split it just records into the single pane's history.
 */
export function followFocus(
  state: PaneState,
  prev: TabRef | null,
  next: TabRef | null,
  record = true,
): PaneState {
  const { split } = state;
  const log = (h: NavHistory) => (record && next ? visit(h, next) : h);
  if (!split) return record && next ? { split: null, solo: visit(state.solo, next) } : state;

  const at = prev ? indexOf(split, prev) : -1;
  if (!next || !isNoteTab(next)) return single(log(at === -1 ? emptyHistory : split.histories[at]));
  if (indexOf(split, next) !== -1) return state;
  // Focus came from outside the split (its pane was just closed): a note with
  // no pane would cover the others, so the split ends instead.
  if (at === -1) return single(log(emptyHistory));
  const panes = split.panes.slice();
  const histories = split.histories.slice();
  panes[at] = next;
  histories[at] = log(histories[at]);
  return { split: { ...split, panes, histories }, solo: state.solo };
}

/** The pane that should take focus when `tab`'s pane closes: the one to its
 *  left, or the one to its right for the first pane. */
export function neighbourOf(split: Split, tab: TabRef): TabRef | null {
  const at = indexOf(split, tab);
  if (at === -1) return null;
  return split.panes[at > 0 ? at - 1 : 1] ?? null;
}

/** The pane after `tab`, wrapping around — what ⌘. cycles through. */
export function nextPane(split: Split, tab: TabRef): TabRef | null {
  const at = indexOf(split, tab);
  if (at === -1) return split.panes[0] ?? null;
  return split.panes[(at + 1) % split.panes.length] ?? null;
}

/** Remove the pane showing `tab` and share the width evenly again. With one
 *  pane left it is no split at all, and keeps its own history. */
export function closePane(state: PaneState, tab: TabRef): PaneState {
  const { split } = state;
  if (!split) return state;
  const at = indexOf(split, tab);
  if (at === -1) return state;
  if (split.panes.length <= 2) return single(split.histories[at === 0 ? 1 : 0]);
  const panes = split.panes.filter((_, i) => i !== at);
  return {
    split: { panes, sizes: evenSizes(panes.length), histories: split.histories.filter((_, i) => i !== at) },
    solo: state.solo,
  };
}

/** End the split, keeping the pane showing `keep` (or the first). */
export function closeSplit(state: PaneState, keep: TabRef | null): PaneState {
  const { split } = state;
  if (!split) return state;
  const at = keep ? indexOf(split, keep) : -1;
  return single(split.histories[at === -1 ? 0 : at]);
}

/** Drop every pane whose tab no longer exists. */
export function dropFromSplit(state: PaneState, gone: (tab: TabRef) => boolean): PaneState {
  const { split } = state;
  if (!split) return state;
  const keep = split.panes.map((tab) => !gone(tab));
  if (keep.every(Boolean)) return state;
  const panes = split.panes.filter((_, i) => keep[i]);
  const histories = split.histories.filter((_, i) => keep[i]);
  if (panes.length < 2) return single(histories[0] ?? emptyHistory);
  return { split: { panes, sizes: evenSizes(panes.length), histories }, solo: state.solo };
}

const mapRel = (tab: TabRef, rel: string, next: string): TabRef => {
  if (tab.kind !== "vault") return tab;
  if (tab.rel === rel) return vaultNote(next);
  return tab.rel.startsWith(`${rel}/`) ? vaultNote(next + tab.rel.slice(rel.length)) : tab;
};

/** Follow a rename/move of `rel` → `next` (note or folder), in the panes and
 *  in every history. */
export function remapSplit(state: PaneState, rel: string, next: string): PaneState {
  const { split } = state;
  return {
    split: split && {
      panes: split.panes.map((tab) => mapRel(tab, rel, next)),
      sizes: split.sizes,
      histories: split.histories.map((h) => remapHistory(h, rel, next)),
    },
    solo: remapHistory(state.solo, rel, next),
  };
}

/** Forget `rel` and anything under it in every history (a deleted note). */
export function pruneState(state: PaneState, rel: string): PaneState {
  const { split } = state;
  return {
    split: split && { ...split, histories: split.histories.map((h) => pruneHistory(h, rel)) },
    solo: pruneHistory(state.solo, rel),
  };
}

/** Swap tab references in place (external-note rename). */
export function replaceInSplit(state: PaneState, from: TabRef, to: TabRef): PaneState {
  const { split } = state;
  if (!split) return state;
  return { split: { ...split, panes: split.panes.map((p) => (sameTab(p, from) ? to : p)) }, solo: state.solo };
}

/** Swap `tab`'s pane with the one to its right (the last pane swaps with the
 *  one to its left). Widths stay with their positions; a pane's history moves
 *  with its content. */
export function swapWithNext(state: PaneState, tab: TabRef): PaneState {
  const { split } = state;
  if (!split) return state;
  const at = indexOf(split, tab);
  if (at === -1) return state;
  const other = at + 1 < split.panes.length ? at + 1 : at - 1;
  if (other < 0) return state;
  const panes = split.panes.slice();
  const histories = split.histories.slice();
  [panes[at], panes[other]] = [panes[other], panes[at]];
  [histories[at], histories[other]] = [histories[other], histories[at]];
  return { split: { ...split, panes, histories }, solo: state.solo };
}

/** Tabs shown in the other panes: history steps landing on one are skipped,
 *  otherwise "back" would appear to do nothing. */
const shownElsewhere = (state: PaneState, tab: TabRef) => {
  const others = state.split?.panes.filter((p) => !sameTab(p, tab)) ?? [];
  return (candidate: TabRef) => others.some((p) => sameTab(p, candidate));
};

export type StepDirection = "back" | "forward";

/** Move the focused pane's history one step. Returns the tab to show there
 *  (the caller displays it without recording), or null at the edge. */
export function stepPane(
  state: PaneState,
  focused: TabRef,
  direction: StepDirection,
): { state: PaneState; tab: TabRef } | null {
  const history = historyOf(state, focused);
  const skip = shownElsewhere(state, focused);
  const stepped = (direction === "back" ? stepBackSkipping : stepForwardSkipping)(history, skip);
  if (stepped === history) return null;
  const tab = stepped.entries[stepped.index];
  if (!state.split) return { state: { split: null, solo: stepped }, tab };
  const at = indexOf(state.split, focused);
  const histories = state.split.histories.slice();
  histories[at] = stepped;
  return { state: { split: { ...state.split, histories }, solo: state.solo }, tab };
}

/** Whether the pane showing `focused` has somewhere to go that direction. */
export const canStep = (state: PaneState, focused: TabRef, direction: StepDirection) =>
  stepPane(state, focused, direction) !== null;

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
