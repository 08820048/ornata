import { describe, expect, test } from "bun:test";
import {
  MAX_NAV_ENTRIES,
  canGoBack,
  canGoForward,
  emptyHistory,
  pruneHistory,
  remapHistory,
  stepBack,
  stepForward,
  visit,
} from "../src/lib/navHistory";
import { GRAPH_TAB, vaultNote } from "../src/lib/noteRef";

const [a, b, c] = ["a.md", "b.md", "c.md"].map(vaultNote);
const trail = (...tabs: Parameters<typeof visit>[1][]) =>
  tabs.reduce(visit, emptyHistory);

describe("navHistory", () => {
  test("visits build a trail and back/forward walk it", () => {
    let h = trail(a, b, c);
    expect(h.index).toBe(2);
    expect(canGoBack(h)).toBe(true);
    expect(canGoForward(h)).toBe(false);
    h = stepBack(stepBack(h));
    expect(h.entries[h.index]).toEqual(a);
    expect(canGoBack(h)).toBe(false);
    expect(stepBack(h)).toBe(h);
    expect(stepForward(h).entries[1]).toEqual(b);
  });

  test("revisiting the current tab does not add an entry", () => {
    const h = trail(a, a);
    expect(h.entries).toHaveLength(1);
  });

  test("visiting after going back drops the forward trail", () => {
    const h = visit(stepBack(trail(a, b, c)), GRAPH_TAB);
    expect(h.entries).toEqual([a, b, GRAPH_TAB]);
    expect(canGoForward(h)).toBe(false);
  });

  test("trail is capped", () => {
    let h = emptyHistory;
    for (let i = 0; i < MAX_NAV_ENTRIES + 10; i += 1) h = visit(h, vaultNote(`n${i}.md`));
    expect(h.entries).toHaveLength(MAX_NAV_ENTRIES);
    expect(h.index).toBe(MAX_NAV_ENTRIES - 1);
    expect(h.entries[MAX_NAV_ENTRIES - 1]).toEqual(vaultNote(`n${MAX_NAV_ENTRIES + 9}.md`));
  });

  test("remap follows renames of notes and folders", () => {
    const h = remapHistory(trail(vaultNote("x/a.md"), b), "x", "y");
    expect(h.entries[0]).toEqual(vaultNote("y/a.md"));
    expect(remapHistory(trail(a), "a.md", "z.md").entries[0]).toEqual(vaultNote("z.md"));
  });

  test("prune drops deleted entries and keeps the cursor on a survivor", () => {
    const h = pruneHistory(trail(a, b, c), "b.md");
    expect(h.entries).toEqual([a, c]);
    expect(h.index).toBe(1);
    const mid = pruneHistory(stepBack(trail(a, b, c)), "b.md");
    expect(mid.entries[mid.index]).toEqual(a);
    expect(pruneHistory(trail(a), "a.md")).toEqual(emptyHistory);
  });

  test("prune collapses neighbours that become identical", () => {
    const h = pruneHistory(trail(a, b, a), "b.md");
    expect(h.entries).toEqual([a]);
    expect(h.index).toBe(0);
  });
});
