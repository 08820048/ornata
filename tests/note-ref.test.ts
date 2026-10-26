import { expect, test } from "bun:test";
import {
  GRAPH_TAB,
  PROJECTS_TAB,
  isNoteTab,
  relIsUnder,
  remapRelList,
  tabKey,
  tabOfView,
  vaultNote,
  viewOfTab,
} from "../src/lib/noteRef";

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

test("graph and projects tabs are distinct non-note tabs that round-trip through views", () => {
  for (const tab of [GRAPH_TAB, PROJECTS_TAB]) {
    expect(isNoteTab(tab)).toBe(false);
    expect(tabOfView(viewOfTab(tab))).toEqual(tab);
  }
  expect(tabKey(GRAPH_TAB)).not.toBe(tabKey(PROJECTS_TAB));
  const note = vaultNote("a.md");
  expect(isNoteTab(note)).toBe(true);
  expect(viewOfTab(PROJECTS_TAB)).toEqual({ type: "projects" });
  expect(tabOfView(viewOfTab(note))).toEqual(note);
});
