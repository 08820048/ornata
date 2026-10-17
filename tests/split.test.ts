import { describe, expect, test } from "bun:test";
import { emptyHistory, visit, type NavHistory } from "../src/lib/navHistory";
import { GRAPH_TAB, externalNote, vaultNote } from "../src/lib/noteRef";
import {
  canStep,
  closePane,
  closeSplit,
  dropFromSplit,
  followFocus,
  historyOf,
  initialPanes,
  maxPanesFor,
  neighbourOf,
  nextPane,
  openAside,
  pruneState,
  remapSplit,
  replaceInSplit,
  resizeDivider,
  stepPane,
  swapWithNext,
  tabIsUnder,
  type PaneState,
} from "../src/lib/split";
import type { TabRef } from "../src/lib/types";

const [a, b, c, d, e] = ["a.md", "b.md", "c.md", "d.md", "e.md"].map(vaultNote);
const trail = (...tabs: TabRef[]): NavHistory => tabs.reduce(visit, emptyHistory);
const sum = (n: number[]) => n.reduce((x, y) => x + y, 0);
const current = (h: NavHistory) => h.entries[h.index];
const tabsOf = (state: PaneState) => state.split!.panes;
/** A split of `tabs` whose panes each have a distinct history. */
const make = (...tabs: TabRef[]): PaneState => ({
  split: {
    panes: tabs,
    sizes: tabs.map(() => 1 / tabs.length),
    histories: tabs.map((tab) => trail(vaultNote(`before-${(tab as { rel: string }).rel}`), tab)),
  },
  solo: emptyHistory,
});

describe("openAside", () => {
  test("splitting a single pane keeps its history and starts a new one", () => {
    const solo = trail(vaultNote("x.md"), a);
    const next = openAside({ split: null, solo }, a, b);
    expect(tabsOf(next)).toEqual([a, b]);
    expect(next.split!.sizes).toEqual([0.5, 0.5]);
    expect(next.split!.histories[0]).toEqual(solo);
    expect(next.split!.histories[1].entries).toEqual([b]);
  });

  test("ignores the same note, graphs, and notes already in the split", () => {
    expect(openAside(initialPanes, a, a)).toBe(initialPanes);
    expect(openAside(initialPanes, a, GRAPH_TAB)).toBe(initialPanes);
    expect(openAside(initialPanes, GRAPH_TAB, a)).toBe(initialPanes);
    const state = make(a, b);
    expect(openAside(state, a, b)).toBe(state);
  });

  test("a new pane opens right of the focused one, shares the width, and has no history yet", () => {
    const state = make(a, b);
    state.split!.sizes = [0.7, 0.3];
    const three = openAside(state, a, c);
    expect(tabsOf(three)).toEqual([a, c, b]);
    three.split!.sizes.forEach((n) => expect(n).toBeCloseTo(1 / 3));
    expect(three.split!.histories.map((h) => h.entries.length)).toEqual([2, 1, 2]);
    expect(three.split!.histories[2]).toEqual(state.split!.histories[1]);
    expect(tabsOf(openAside(three, b, d))).toEqual([a, c, b, d]);
  });

  test("at the cap the neighbour is replaced and gets a fresh history", () => {
    const state = make(a, b);
    const next = openAside(state, a, c, 2);
    expect(tabsOf(next)).toEqual([a, c]);
    expect(next.split!.histories[1].entries).toEqual([c]);
    expect(tabsOf(openAside(state, b, c, 2))).toEqual([c, b]);
  });

  test("external notes can be split too, and maxPanesFor scales with width", () => {
    const x = externalNote("/tmp/x.md");
    expect(tabsOf(openAside(initialPanes, a, x))).toEqual([a, x]);
    expect(maxPanesFor(500)).toBe(2);
    expect(maxPanesFor(1200)).toBe(3);
    expect(maxPanesFor(3000)).toBe(4);
  });
});

describe("followFocus", () => {
  test("without a split it records into the single history", () => {
    const next = followFocus({ split: null, solo: trail(a) }, a, b);
    expect(next.solo.entries).toEqual([a, b]);
    expect(followFocus({ split: null, solo: trail(a) }, a, b, false).solo.entries).toEqual([a]);
  });

  test("refocusing another pane records nothing", () => {
    const state = make(a, b, c);
    expect(followFocus(state, a, c)).toBe(state);
  });

  test("a new note replaces the focused pane and lands in that pane's history only", () => {
    const state = make(a, b, c);
    const next = followFocus(state, b, d);
    expect(tabsOf(next)).toEqual([a, d, c]);
    expect(next.split!.histories[1].entries.slice(-2)).toEqual([b, d]);
    expect(next.split!.histories[0]).toBe(state.split!.histories[0]);
    expect(next.split!.histories[2]).toBe(state.split!.histories[2]);
  });

  test("stepping through history (record = false) swaps the tab without writing history", () => {
    const state = make(a, b);
    const next = followFocus(state, a, d, false);
    expect(tabsOf(next)).toEqual([d, b]);
    expect(next.split!.histories[0]).toBe(state.split!.histories[0]);
  });

  test("the graph, nothing, or an unknown origin ends the split, keeping a history", () => {
    const state = make(a, b);
    const toGraph = followFocus(state, a, GRAPH_TAB);
    expect(toGraph.split).toBeNull();
    expect(toGraph.solo.entries.slice(-2)).toEqual([a, GRAPH_TAB]);
    expect(followFocus(state, a, null).split).toBeNull();
    const outside = followFocus(state, d, e);
    expect(outside.split).toBeNull();
    expect(outside.solo.entries).toEqual([e]);
  });
});

describe("closing", () => {
  test("closing a pane shares the width evenly and drops only its history", () => {
    const state = make(a, b, c);
    state.split!.sizes = [0.2, 0.3, 0.5];
    const next = closePane(state, b);
    expect(tabsOf(next)).toEqual([a, c]);
    expect(next.split!.sizes).toEqual([0.5, 0.5]);
    expect(next.split!.histories).toEqual([state.split!.histories[0], state.split!.histories[2]]);
  });

  test("down to one pane, the survivor's history becomes the single history", () => {
    const state = make(a, b);
    const next = closePane(state, a);
    expect(next.split).toBeNull();
    expect(next.solo).toBe(state.split!.histories[1]);
    expect(current(next.solo)).toEqual(b);
  });

  test("closeSplit keeps the history of the pane you were in", () => {
    const state = make(a, b, c);
    expect(closeSplit(state, c).solo).toBe(state.split!.histories[2]);
    expect(closeSplit(state, null).solo).toBe(state.split!.histories[0]);
    expect(closeSplit(initialPanes, a)).toBe(initialPanes);
  });

  test("focus goes to the left neighbour, or the right one for the first pane", () => {
    const split = make(a, b, c).split!;
    expect(neighbourOf(split, b)).toEqual(a);
    expect(neighbourOf(split, c)).toEqual(b);
    expect(neighbourOf(split, a)).toEqual(b);
    expect(neighbourOf(split, d)).toBeNull();
  });

  test("dropFromSplit removes gone panes with their histories, and collapses below two", () => {
    const state = make(vaultNote("x/a.md"), b, c);
    const next = dropFromSplit(state, (t) => tabIsUnder(t, "b.md"));
    expect(tabsOf(next)).toEqual([vaultNote("x/a.md"), c]);
    expect(sum(next.split!.sizes)).toBeCloseTo(1);
    expect(next.split!.histories).toHaveLength(2);
    const collapsed = dropFromSplit(state, (t) => tabIsUnder(t, "x") || tabIsUnder(t, "b.md"));
    expect(collapsed.split).toBeNull();
    expect(current(collapsed.solo)).toEqual(c);
    expect(dropFromSplit(state, () => false)).toBe(state);
  });
});

describe("renames, deletes, swaps", () => {
  test("remap follows a rename in the panes and in every history", () => {
    const state: PaneState = { ...make(vaultNote("x/a.md"), b), solo: trail(vaultNote("x/old.md")) };
    const next = remapSplit(state, "x", "y");
    expect(tabsOf(next)[0]).toEqual(vaultNote("y/a.md"));
    expect(next.split!.histories[0].entries.at(-1)).toEqual(vaultNote("y/a.md"));
    expect(next.solo.entries[0]).toEqual(vaultNote("y/old.md"));
  });

  test("a deleted note is forgotten by every history", () => {
    const state: PaneState = { split: make(a, b).split, solo: emptyHistory };
    const next = pruneState(state, "before-a.md");
    expect(next.split!.histories[0].entries).toEqual([a]);
    expect(next.split!.histories[1].entries).toEqual([vaultNote("before-b.md"), b]);
  });

  test("swapping moves a pane's history with its content; widths stay put", () => {
    const state = make(a, b, c);
    state.split!.sizes = [0.5, 0.3, 0.2];
    const next = swapWithNext(state, a);
    expect(tabsOf(next)).toEqual([b, a, c]);
    expect(next.split!.sizes).toEqual([0.5, 0.3, 0.2]);
    expect(next.split!.histories[0]).toBe(state.split!.histories[1]);
    expect(next.split!.histories[1]).toBe(state.split!.histories[0]);
    expect(tabsOf(swapWithNext(state, c))).toEqual([a, c, b]);
    expect(swapWithNext(initialPanes, a)).toBe(initialPanes);
  });

  test("replaceInSplit swaps one tab reference and nextPane wraps", () => {
    const x = externalNote("/a"), y = externalNote("/b");
    expect(tabsOf(replaceInSplit(make(x, a), x, y))).toEqual([y, a]);
    const split = make(a, b, c).split!;
    expect(nextPane(split, c)).toEqual(a);
    expect(nextPane(split, d)).toEqual(a);
  });
});

describe("per-pane back and forward", () => {
  test("each pane steps through its own trail", () => {
    // pane 1: x → a → a2; pane 2: y → b
    const state: PaneState = {
      split: {
        panes: [vaultNote("a2.md"), b],
        sizes: [0.5, 0.5],
        histories: [trail(vaultNote("x.md"), a, vaultNote("a2.md")), trail(vaultNote("y.md"), b)],
      },
      solo: emptyHistory,
    };
    const left = stepPane(state, vaultNote("a2.md"), "back")!;
    expect(left.tab).toEqual(a);
    expect(left.state.split!.histories[1]).toBe(state.split!.histories[1]); // the other pane is untouched
    const right = stepPane(state, b, "back")!;
    expect(right.tab).toEqual(vaultNote("y.md"));
    expect(stepPane(state, b, "forward")).toBeNull();
    expect(canStep(state, b, "back")).toBe(true);
    expect(canStep(state, b, "forward")).toBe(false);
  });

  test("a step that would land on a note open in another pane skips past it", () => {
    const state: PaneState = {
      split: {
        panes: [c, b],
        sizes: [0.5, 0.5],
        histories: [trail(a, b, c), trail(b)], // pane 1 once showed b, which pane 2 shows now
      },
      solo: emptyHistory,
    };
    const stepped = stepPane(state, c, "back")!;
    expect(stepped.tab).toEqual(a);
    expect(stepped.state.split!.histories[0].index).toBe(0);
    // with nowhere else to go the arrow is disabled
    const stuck: PaneState = { split: { ...state.split!, histories: [trail(b, c), trail(b)] }, solo: emptyHistory };
    expect(canStep(stuck, c, "back")).toBe(false);
  });

  test("a single pane steps through its own history too", () => {
    const state: PaneState = { split: null, solo: trail(a, b, c) };
    const back = stepPane(state, c, "back")!;
    expect(back.tab).toEqual(b);
    expect(back.state.solo.index).toBe(1);
    expect(stepPane(back.state, b, "forward")!.tab).toEqual(c);
    expect(historyOf(state, c)).toBe(state.solo);
  });
});

describe("resizeDivider", () => {
  test("moves the boundary and keeps the pair's total", () => {
    const sizes = resizeDivider([0.5, 0.3, 0.2], 0, 0.1, 0.1);
    expect(sizes[0]).toBeCloseTo(0.6);
    expect(sizes[1]).toBeCloseTo(0.2);
    expect(sizes[2]).toBe(0.2);
  });

  test("clamps at the minimum on both sides", () => {
    const right = resizeDivider([0.5, 0.5], 0, 0.9, 0.2);
    expect(right[0]).toBeCloseTo(0.8);
    const left = resizeDivider([0.5, 0.5], 0, -0.9, 0.2);
    expect(left[0]).toBeCloseTo(0.2);
  });
});
