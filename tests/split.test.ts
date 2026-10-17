import { describe, expect, test } from "bun:test";
import { GRAPH_TAB, externalNote, vaultNote } from "../src/lib/noteRef";
import {
  closePane,
  dropFromSplit,
  followFocus,
  maxPanesFor,
  openAside,
  remapSplit,
  replaceInSplit,
  resizeDivider,
  neighbourOf,
  nextPane,
  swapWithNext,
  tabIsUnder,
} from "../src/lib/split";

const [a, b, c, d, e] = ["a.md", "b.md", "c.md", "d.md", "e.md"].map(vaultNote);
const sum = (n: number[]) => n.reduce((x, y) => x + y, 0);

describe("openAside", () => {
  test("creates a two-pane split with the focused note on the left", () => {
    expect(openAside(null, a, b)).toEqual({ panes: [a, b], sizes: [0.5, 0.5] });
  });

  test("ignores the same note, graphs, and notes already in the split", () => {
    expect(openAside(null, a, a)).toBeNull();
    expect(openAside(null, a, GRAPH_TAB)).toBeNull();
    expect(openAside(null, GRAPH_TAB, a)).toBeNull();
    const split = { panes: [a, b], sizes: [0.5, 0.5] };
    expect(openAside(split, a, b)).toBe(split);
  });

  test("a new pane opens right of the focused one and the width is shared evenly", () => {
    const split = { panes: [a, b], sizes: [0.7, 0.3] };
    const three = openAside(split, a, c)!;
    expect(three.panes).toEqual([a, c, b]);
    three.sizes.forEach((n) => expect(n).toBeCloseTo(1 / 3));
    expect(openAside(split, b, c)!.panes).toEqual([a, b, c]);
    const four = openAside(three, b, d)!;
    expect(four.panes).toEqual([a, c, b, d]);
    four.sizes.forEach((n) => expect(n).toBeCloseTo(0.25));
  });

  test("at the cap the neighbour is replaced instead", () => {
    const split = { panes: [a, b], sizes: [0.5, 0.5] };
    expect(openAside(split, a, c, 2)).toEqual({ panes: [a, c], sizes: [0.5, 0.5] });
    expect(openAside(split, b, c, 2)).toEqual({ panes: [c, b], sizes: [0.5, 0.5] });
  });

  test("external notes can be split too", () => {
    const x = externalNote("/tmp/x.md");
    expect(openAside(null, a, x)?.panes).toEqual([a, x]);
  });

  test("maxPanesFor scales with width, between 2 and 4", () => {
    expect(maxPanesFor(500)).toBe(2);
    expect(maxPanesFor(1200)).toBe(3);
    expect(maxPanesFor(3000)).toBe(4);
  });
});

describe("followFocus", () => {
  const split = { panes: [a, b, c], sizes: [0.4, 0.3, 0.3] };
  test("refocuses a pane, replaces the focused one, or closes", () => {
    expect(followFocus(split, a, c)).toBe(split);
    expect(followFocus(split, b, d)).toEqual({ panes: [a, d, c], sizes: [0.4, 0.3, 0.3] });
    expect(followFocus(split, a, GRAPH_TAB)).toBeNull();
    expect(followFocus(split, a, null)).toBeNull();
    // focus from a pane that no longer exists onto a note with no pane
    expect(followFocus(split, d, e)).toBeNull();
    expect(followFocus(split, d, c)).toBe(split);
    expect(followFocus(null, a, b)).toBeNull();
  });
});

describe("closePane", () => {
  test("shares the width evenly among the remaining panes", () => {
    const split = { panes: [a, b, c], sizes: [0.2, 0.3, 0.5] };
    expect(closePane(split, b)).toEqual({ panes: [a, c], sizes: [0.5, 0.5] });
    expect(closePane(split, a)).toEqual({ panes: [b, c], sizes: [0.5, 0.5] });
  });

  test("focus goes to the left neighbour, or the right one for the first pane", () => {
    const split = { panes: [a, b, c], sizes: [0.2, 0.3, 0.5] };
    expect(neighbourOf(split, b)).toEqual(a);
    expect(neighbourOf(split, c)).toEqual(b);
    expect(neighbourOf(split, a)).toEqual(b);
    expect(neighbourOf(split, d)).toBeNull();
  });

  test("closing down to one pane ends the split", () => {
    expect(closePane({ panes: [a, b], sizes: [0.5, 0.5] }, a)).toBeNull();
  });
});

describe("dropFromSplit / remap / replace", () => {
  const split = { panes: [vaultNote("x/a.md"), b, c], sizes: [0.5, 0.25, 0.25] };

  test("drops gone panes and renormalizes; collapses below two", () => {
    const next = dropFromSplit(split, (t) => tabIsUnder(t, "b.md"))!;
    expect(next.panes).toEqual([vaultNote("x/a.md"), c]);
    expect(next.sizes).toEqual([0.5, 0.5]);
    expect(sum(next.sizes)).toBeCloseTo(1);
    expect(dropFromSplit(split, (t) => tabIsUnder(t, "x") || tabIsUnder(t, "b.md"))).toBeNull();
    expect(dropFromSplit(split, () => false)).toBe(split);
  });

  test("remap follows renames of notes and folders", () => {
    expect(remapSplit(split, "x", "y")!.panes[0]).toEqual(vaultNote("y/a.md"));
    expect(remapSplit(split, "b.md", "z.md")!.panes[1]).toEqual(vaultNote("z.md"));
    expect(remapSplit(null, "x", "y")).toBeNull();
  });

  test("replaceInSplit swaps one tab reference", () => {
    const x = externalNote("/a"), y = externalNote("/b");
    expect(replaceInSplit({ panes: [x, a], sizes: [0.5, 0.5] }, x, y)!.panes).toEqual([y, a]);
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
    expect(right[1]).toBeCloseTo(0.2);
    const left = resizeDivider([0.5, 0.5], 0, -0.9, 0.2);
    expect(left[0]).toBeCloseTo(0.2);
    expect(left[1]).toBeCloseTo(0.8);
  });
});

describe("swapWithNext / nextPane", () => {
  const split = { panes: [a, b, c], sizes: [0.5, 0.3, 0.2] };

  test("swaps with the right neighbour; the last pane swaps left; widths stay put", () => {
    expect(swapWithNext(split, a)).toEqual({ panes: [b, a, c], sizes: [0.5, 0.3, 0.2] });
    expect(swapWithNext(split, b)).toEqual({ panes: [a, c, b], sizes: [0.5, 0.3, 0.2] });
    expect(swapWithNext(split, c)).toEqual({ panes: [a, c, b], sizes: [0.5, 0.3, 0.2] });
    expect(swapWithNext(split, d)).toBe(split);
    expect(swapWithNext(null, a)).toBeNull();
  });

  test("nextPane wraps around and falls back to the first pane", () => {
    expect(nextPane(split, a)).toEqual(b);
    expect(nextPane(split, c)).toEqual(a);
    expect(nextPane(split, d)).toEqual(a);
  });
});
