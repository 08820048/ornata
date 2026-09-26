import { expect, test } from "bun:test";
import { relIsUnder, remapRelList } from "../src/lib/noteRef";

test("remapRelList rewrites a note and everything inside a folder", () => {
  expect(remapRelList(["a.md", "projects/a.md", "projects/sub/b.md", "other.md"], "projects", "work")).toEqual([
    "a.md",
    "work/a.md",
    "work/sub/b.md",
    "other.md",
  ]);
  expect(remapRelList(["Idea.md", "Idea 2.md"], "Idea.md", "Big Idea.md")).toEqual([
    "Big Idea.md",
    "Idea 2.md",
  ]);
});

test("remapRelList drops a duplicate produced by the move", () => {
  expect(remapRelList(["a.md", "b.md"], "a.md", "b.md")).toEqual(["b.md"]);
});

test("relIsUnder matches the entry and its descendants only", () => {
  expect(relIsUnder("projects/a.md", "projects")).toBe(true);
  expect(relIsUnder("projects", "projects")).toBe(true);
  expect(relIsUnder("projects-old/a.md", "projects")).toBe(false);
  expect(relIsUnder("other.md", "projects")).toBe(false);
});
