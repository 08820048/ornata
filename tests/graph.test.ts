import { expect, test } from "bun:test";
import { convexHull, groupOf } from "../src/components/graph/graphGroups";
import { mergeLinks } from "../src/components/graph/graphPaint";
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
