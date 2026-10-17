import { describe, expect, test } from "bun:test";
import { GRAPH_TAB, externalNote, vaultNote } from "../src/lib/noteRef";
import {
  dropFromSplit,
  followFocus,
  openAside,
  remapSplit,
  tabIsUnder,
} from "../src/lib/split";

const [a, b, c] = ["a.md", "b.md", "c.md"].map(vaultNote);

describe("split", () => {
  test("openAside creates a split with the focused note on the left", () => {
    expect(openAside(null, a, b)).toEqual({ left: a, right: b });
  });

  test("opening the focused note aside, or a graph, changes nothing", () => {
    expect(openAside(null, a, a)).toBeNull();
    expect(openAside(null, a, GRAPH_TAB)).toBeNull();
    expect(openAside(null, GRAPH_TAB, a)).toBeNull();
    const split = { left: a, right: b };
    expect(openAside(split, a, a)).toBe(split);
  });

  test("with a split open, the unfocused side is replaced", () => {
    const split = { left: a, right: b };
    expect(openAside(split, a, c)).toEqual({ left: a, right: c });
    expect(openAside(split, b, c)).toEqual({ left: c, right: b });
    expect(openAside(split, a, b)).toBe(split);
    expect(openAside(split, b, a)).toBe(split);
  });

  test("external notes can be split too", () => {
    const x = externalNote("/tmp/x.md");
    expect(openAside(null, a, x)).toEqual({ left: a, right: x });
  });

  test("followFocus refocuses, replaces the focused side, or closes", () => {
    const split = { left: a, right: b };
    expect(followFocus(split, a, b)).toBe(split);
    expect(followFocus(split, a, c)).toEqual({ left: c, right: b });
    expect(followFocus(split, b, c)).toEqual({ left: a, right: c });
    expect(followFocus(split, a, GRAPH_TAB)).toBeNull();
    expect(followFocus(split, a, null)).toBeNull();
    expect(followFocus(null, a, b)).toBeNull();
  });

  test("dropFromSplit collapses when either side is gone", () => {
    const split = { left: a, right: b };
    expect(dropFromSplit(split, (t) => tabIsUnder(t, "b.md"))).toBeNull();
    expect(dropFromSplit(split, (t) => tabIsUnder(t, "z"))).toBe(split);
  });

  test("remapSplit follows renames of notes and folders", () => {
    const split = { left: vaultNote("x/a.md"), right: b };
    expect(remapSplit(split, "x", "y")).toEqual({ left: vaultNote("y/a.md"), right: b });
    expect(remapSplit(split, "b.md", "z.md")).toEqual({ left: vaultNote("x/a.md"), right: vaultNote("z.md") });
    expect(remapSplit(null, "x", "y")).toBeNull();
  });
});
