import { describe, expect, test } from "bun:test";
import { emptyHistory, visit, type NavHistory } from "../src/lib/navHistory";
import { GRAPH_TAB, externalNote, vaultNote } from "../src/lib/noteRef";
import { restorePanes, retainHistory } from "../src/lib/paneSession";
import type { PaneState } from "../src/lib/split";
import type { TabRef } from "../src/lib/types";

const [a, b, c, d] = ["a.md", "b.md", "c.md", "d.md"].map(vaultNote);
const trail = (...tabs: TabRef[]): NavHistory => tabs.reduce(visit, emptyHistory);
const gone = new Set<string>();
const valid = (tab: TabRef) => tab.kind !== "vault" || !gone.has(tab.rel);
/** The same parser the session uses, reduced to what these tests need. */
const parseTab = (value: unknown): TabRef | null => {
  if (!value || typeof value !== "object") return null;
  const v = value as { kind?: string; rel?: string; path?: string };
  if (v.kind === "graph") return GRAPH_TAB;
  if (v.kind === "vault" && typeof v.rel === "string") return vaultNote(v.rel);
  if (v.kind === "external" && typeof v.path === "string") return externalNote(v.path);
  return null;
};
/** What localStorage does to it. */
const roundTrip = (state: PaneState) => JSON.parse(JSON.stringify(state));

const saved: PaneState = {
  split: {
    panes: [b, d],
    sizes: [0.3, 0.7],
    histories: [trail(a, b), trail(c, d)],
  },
  solo: emptyHistory,
};

describe("restorePanes", () => {
  test("a split comes back with its panes, widths, and each pane's own history", () => {
    gone.clear();
    const state = restorePanes(roundTrip(saved), parseTab, valid);
    expect(state.split!.panes).toEqual([b, d]);
    expect(state.split!.sizes).toEqual([0.3, 0.7]);
    expect(state.split!.histories).toEqual(saved.split!.histories);
  });

  test("a single pane's history comes back too", () => {
    const state = restorePanes(roundTrip({ split: null, solo: trail(a, b, c) }), parseTab, valid);
    expect(state.split).toBeNull();
    expect(state.solo.entries).toEqual([a, b, c]);
    expect(state.solo.index).toBe(2);
  });

  test("a pane whose note was deleted is dropped; one left means no split", () => {
    gone.clear();
    gone.add("d.md");
    const state = restorePanes(roundTrip(saved), parseTab, valid);
    expect(state.split).toBeNull();
    expect(state.solo.entries).toEqual([a, b]); // the survivor keeps its own trail
    gone.clear();
  });

  test("deleted notes are also forgotten inside the histories that remain", () => {
    gone.clear();
    gone.add("c.md");
    const three: PaneState = {
      split: { panes: [a, b, d], sizes: [0.2, 0.3, 0.5], histories: [trail(a), trail(b), trail(c, d)] },
      solo: emptyHistory,
    };
    const state = restorePanes(roundTrip(three), parseTab, valid);
    expect(state.split!.histories[2].entries).toEqual([d]);
    gone.clear();
  });

  test("widths are renormalized after a pane is dropped", () => {
    gone.clear();
    gone.add("b.md");
    const three: PaneState = {
      split: { panes: [a, b, d], sizes: [0.2, 0.3, 0.5], histories: [trail(a), trail(b), trail(d)] },
      solo: emptyHistory,
    };
    const sizes = restorePanes(roundTrip(three), parseTab, valid).split!.sizes;
    expect(sizes.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
    expect(sizes[0]).toBeCloseTo(0.2 / 0.7);
    gone.clear();
  });

  test("the graph can't be a pane, and damaged data degrades instead of throwing", () => {
    gone.clear();
    const withGraph = roundTrip({ ...saved, split: { ...saved.split!, panes: [b, GRAPH_TAB] } });
    expect(restorePanes(withGraph, parseTab, valid).split).toBeNull();
    for (const junk of [null, undefined, 5, "x", [], { split: 3 }, { split: { panes: "no" } }, { split: { panes: [null, 1] } }]) {
      expect(restorePanes(junk, parseTab, valid).split).toBeNull();
    }
  });

  test("a pane's trail is repaired to end at what it shows", () => {
    gone.clear();
    const stale = { split: { panes: [a, b], sizes: [0.5, 0.5], histories: [trail(c), trail(b)] }, solo: emptyHistory };
    const state = restorePanes(roundTrip(stale), parseTab, valid);
    expect(state.split!.histories[0].entries).toEqual([c, a]);
    expect(state.split!.histories[0].index).toBe(1);
  });
});

describe("retainHistory", () => {
  test("keeps the cursor on the nearest surviving entry", () => {
    const h: NavHistory = { entries: [a, b, c, d], index: 2 };
    const r = retainHistory(h, (t) => !(t.kind === "vault" && t.rel === "b.md"));
    expect(r.entries).toEqual([a, c, d]);
    expect(r.entries[r.index]).toEqual(c);
    expect(retainHistory(h, () => false)).toEqual(emptyHistory);
  });
});
