import { expect, test } from "bun:test";
import { convexHull, folderSlots, groupOf } from "../src/components/graph/graphGroups";
import { mergeLinks, paintGraph, type SimNode } from "../src/components/graph/graphPaint";
import { searchNodes } from "../src/components/graph/graphSearch";
import { neighborhood } from "../src/components/graph/neighborhood";

const graph = (edges: [string, string][]) => ({
  nodes: [...new Set(edges.flat())].map((rel) => ({ rel, title: rel })),
  edges: edges.map(([from, to]) => ({ from, to })),
});

test("neighborhood follows links both ways, one or two hops", () => {
  const g = graph([["a", "b"], ["c", "a"], ["b", "d"]]);
  expect(Object.fromEntries(neighborhood(g, "a", 1).depth)).toEqual({ a: 0, b: 1, c: 1 });
  expect(Object.fromEntries(neighborhood(g, "a", 2).depth)).toEqual({ a: 0, b: 1, c: 1, d: 2 });
  expect(neighborhood(g, "missing", 2).depth.size).toBe(1);
});

test("neighborhood caps the outer ring, keeping the best connected", () => {
  const edges: [string, string][] = [["a", "hub"]];
  for (let i = 0; i < 100; i++) edges.push(["hub", `x${i}`]);
  edges.push(["x7", "y"], ["x7", "z"]);
  const hood = neighborhood(graph(edges), "a", 2, 10);
  expect(hood.hidden).toBe(90);
  expect(hood.depth.get("x7")).toBe(2);
  expect(hood.depth.size).toBe(12);
});

test("search ranks title prefix, then title, then path; degree breaks ties", () => {
  const nodes = [
    { rel: "x/Api notes.md", title: "Api notes", degree: 1 },
    { rel: "Rapid.md", title: "Rapid", degree: 9 },
    { rel: "api/Other.md", title: "Other", degree: 5 },
    { rel: "Apple.md", title: "Apple", degree: 0 },
    { rel: "Api.md", title: "Api", degree: 3 },
  ];
  expect(searchNodes(nodes, "ap")).toEqual([
    "Api.md",
    "x/Api notes.md",
    "Apple.md",
    "Rapid.md",
    "api/Other.md",
  ]);
  expect(searchNodes(nodes, "  ")).toEqual([]);
});

test("mergeLinks folds reciprocal links into one mutual edge", () => {
  const edges = mergeLinks([
    { from: "a", to: "b" },
    { from: "b", to: "a" },
    { from: "a", to: "c" },
  ]);
  expect(edges.map((e) => [e.from, e.to, e.mutual])).toEqual([
    ["a", "b", true],
    ["a", "c", false],
  ]);
});

test("groups are top-level folders; hulls drop interior points", () => {
  expect(groupOf("root.md")).toBe(null);
  expect(groupOf("projects/sub/x.md")).toBe("projects");
  const hull = convexHull([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 5, y: 5 },
  ]);
  expect(hull).toHaveLength(4);
  expect(hull).not.toContainEqual({ x: 5, y: 5 });
});

test("folder slots go to the largest folders, ties by name, rest uncolored", () => {
  const rels = [
    "root.md",
    ...["a", "b", "c"].map((n) => `big/${n}.md`),
    ...["a", "b"].map((n) => `beta/${n}.md`),
    ...["a", "b"].map((n) => `alpha/${n}.md`),
    "gamma/a.md",
    "tiny/a.md",
  ];
  expect([...folderSlots(rels)]).toEqual([
    ["big", 0],
    ["alpha", 1],
    ["beta", 2],
    ["gamma", 3],
  ]);
  expect(folderSlots(rels).has("tiny")).toBe(false);
});

test("colored folders tint their region and dots; others stay gray", () => {
  const fills: string[] = [];
  const ctx: any = new Proxy({ globalAlpha: 1 } as Record<string, unknown>, {
    get(target, key) {
      if (key === "measureText") return () => ({ width: 10 });
      if (key === "fill") return () => fills.push(String(target.fillStyle));
      return key in target ? target[key as string] : () => {};
    },
    set(target, key, value) {
      target[key as string] = value;
      return true;
    },
  });
  const node = (rel: string, x: number, hue: number | null): SimNode => ({
    rel, title: rel, x, y: 0, r: 5, degree: 1, isolated: false, group: groupOf(rel), hue,
  });
  paintGraph({
    ctx, width: 800, height: 400, dt: 0, hover: null, showIsolated: true, groups: true,
    view: { x: 100, y: 200, k: 1 },
    nodes: [node("p/a.md", 0, 0), node("p/b.md", 60, 0), node("q/a.md", 300, null), node("q/b.md", 360, null)],
    edges: [],
    palette: { ink: "#000000", muted: "#666666", faint: "#aaaaaa", line: "#dddddd", bg: "#ffffff", sunken: "#eeeeee", groups: ["#2a78d6"], font: "x" },
  });
  // Regions first: p tinted 16% toward its blue, q on the neutral recess.
  expect(fills.slice(0, 2)).toEqual(["rgb(221,233,248)", "#eeeeee"]);
  // Then dots: p's in its folder color, q's in muted gray.
  expect(fills.slice(2)).toEqual([
    "rgba(42,120,214,1.000)",
    "rgba(42,120,214,1.000)",
    "rgba(102,102,102,1.000)",
    "rgba(102,102,102,1.000)",
  ]);
});
