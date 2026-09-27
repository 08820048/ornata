import { expect, test } from "bun:test";
import { sortChildren } from "../src/lib/tree";
import type { TreeNode } from "../src/lib/types";

const node = (rel: string, kind: "note" | "folder", modifiedMs = 0): TreeNode => ({
  name: rel.split("/").pop() ?? rel,
  rel,
  kind,
  modifiedMs,
});

const tree = [
  node("b.md", "note", 100),
  node("projects", "folder"),
  node("a.md", "note", 300),
  node("c.md", "note", 200),
];

test("name mode returns the backend order untouched", () => {
  expect(sortChildren(tree, "name")).toBe(tree);
});

test("modified mode orders notes by mtime desc, folders keep name order", () => {
  const sorted = sortChildren(tree, "modified");
  expect(sorted.map((n) => n.rel)).toEqual([
    "projects",
    "a.md",
    "c.md",
    "b.md",
  ]);
});

test("modified mode keeps folder order stable across the cut", () => {
  const folders = [
    node("zeta", "folder"),
    node("alpha", "folder"),
  ];
  expect(sortChildren(folders, "modified").map((n) => n.rel)).toEqual([
    "zeta",
    "alpha",
  ]);
});
