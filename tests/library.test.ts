import { expect, test } from "bun:test";
import {
  allFolders,
  backPlatePath,
  coverNotes,
  crumbsOf,
  folderAt,
  glassPath,
  gridLayout,
  paperPose,
  parentOf,
  plainInline,
  previewBlocks,
  sketchLines,
} from "../src/lib/library";
import type { TreeNode } from "../src/lib/types";

const note = (rel: string, modifiedMs = 0): TreeNode => ({
  name: rel.split("/").pop()!.replace(/\.md$/, ""),
  rel,
  kind: "note",
  modifiedMs,
});
const folder = (rel: string, children: TreeNode[]): TreeNode => ({
  name: rel.split("/").pop()!,
  rel,
  kind: "folder",
  children,
  modifiedMs: 0,
});

const tree = [
  folder("work", [folder("work/app", [note("work/app/plan.md", 5)]), note("work/a.md", 1), note("work/b.md", 9)]),
  note("root.md"),
];

test("folderAt walks nested folders and reports a missing one", () => {
  expect(folderAt(tree, "")).toBe(tree);
  expect(folderAt(tree, "work/app")?.map((node) => node.rel)).toEqual(["work/app/plan.md"]);
  expect(folderAt(tree, "work/gone")).toBeNull();
  expect(folderAt(tree, "root.md")).toBeNull();
});

test("crumbsOf lists the folders leading to a path", () => {
  expect(crumbsOf("")).toEqual([]);
  expect(crumbsOf("work/app")).toEqual([
    { name: "work", rel: "work" },
    { name: "app", rel: "work/app" },
  ]);
});

test("coverNotes prefers a folder's own notes, newest first", () => {
  expect(coverNotes(tree[0]).map((node) => node.rel)).toEqual(["work/b.md", "work/a.md"]);
});

test("coverNotes borrows from subfolders when a folder has no notes of its own", () => {
  const outer = folder("outer", [folder("outer/in", [note("outer/in/x.md")])]);
  expect(coverNotes(outer).map((node) => node.rel)).toEqual(["outer/in/x.md"]);
  expect(coverNotes(folder("empty", []))).toEqual([]);
});

test("plainInline keeps link labels and drops markup", () => {
  expect(plainInline("A claim[^1] and another[^note].")).toBe("A claim and another.");
  expect(plainInline("[^1]: The source.")).toBe("The source.");
  expect(plainInline("**Bold** and [a link](x/y.md), `code` ![img](a.png) [[t|alias]]")).toBe(
    "Bold and a link, code  alias",
  );
  expect(plainInline("A &amp; B &lt;tag&gt;")).toBe("A & B <tag>",
  );
});

test("previewBlocks drops the heading that repeats the title", () => {
  expect(previewBlocks("# Plan\n\nFirst line\nsame paragraph\n\n## Next", "Plan")).toEqual([
    { kind: "text", text: "First line same paragraph" },
    { kind: "heading", level: 2, text: "Next" },
  ]);
  expect(previewBlocks("# Other", "Plan")).toEqual([{ kind: "heading", level: 1, text: "Other" }]);
});

test("previewBlocks reads lists, task states, quotes, code, tables and rules", () => {
  const md = [
    "- one",
    "  - [/] doing",
    "1. first",
    "- [x] done",
    "> quoted",
    "```ts",
    "const a = 1;",
    "```",
    "| A | B |",
    "| --- | --- |",
    "| 1 | 2 |",
    "---",
    "![shot](a.png)",
  ].join("\n");
  expect(previewBlocks(md, "T")).toEqual([
    { kind: "item", marker: "bullet", label: "", depth: 0, text: "one" },
    { kind: "item", marker: "doing", label: "", depth: 1, text: "doing" },
    { kind: "item", marker: "number", label: "1", depth: 0, text: "first" },
    { kind: "item", marker: "done", label: "", depth: 0, text: "done" },
    { kind: "quote", text: "quoted" },
    { kind: "code", lang: "ts", lines: ["const a = 1;"] },
    { kind: "table", rows: [["A", "B"], ["1", "2"]] },
    { kind: "rule" },
    { kind: "image", src: "a.png" },
  ]);
});

test("previewBlocks stops at the block limit", () => {
  expect(previewBlocks("a\n\nb\n\nc\n\nd", "T", 2)).toHaveLength(2);
});

test("previewBlocks keeps an image's source, in markdown or html form", () => {
  expect(previewBlocks('![a](.ornata/assets/x%20y.png "t")\n\n<img src="b.png" width="30">', "T")).toEqual([
    { kind: "image", src: ".ornata/assets/x%20y.png" },
    { kind: "image", src: "b.png" },
  ]);
});

test("gridLayout picks at least four columns for a wide pane", () => {
  const wide = gridLayout(1152, true);
  expect(wide.cols).toBe(4);
  expect(wide.gap).toBe(24);
  expect(wide.colWidth).toBe(270);
  expect(wide.noteHeight).toBe(324);
  expect(wide.rowHeight).toBeCloseTo(324 / 0.94, 5);
  expect(gridLayout(1600, false).cols).toBe(6);
});

test("gridLayout keeps narrow panes to three columns or fewer", () => {
  expect(gridLayout(700, false).cols).toBe(3);
  expect(gridLayout(360, false).cols).toBe(2);
  expect(gridLayout(100, false).cols).toBe(1);
  const plain = gridLayout(700, false);
  expect(plain.rowHeight).toBe(plain.noteHeight);
});

test("the folder front leans back and widens as it opens", () => {
  const closed = glassPath(240, 300, 0);
  const open = glassPath(240, 300, 1);
  expect(closed.edge.startsWith("M0 165")).toBe(true);
  expect(open.edge.startsWith("M-3 174")).toBe(true);
  expect(closed.sheet.endsWith("Z")).toBe(true);
  expect(backPlatePath(240, 300)).toContain("L74 0");
});

test("papers rise and fan out on hover, the front one staying upright", () => {
  expect(paperPose(0, 0, 200, 300)).toEqual({ x: 0, y: 48, rotate: 0 });
  expect(paperPose(0, 1, 200, 300).rotate).toBe(0);
  expect(paperPose(0, 1, 200, 300).y).toBeCloseTo(27, 5);
  expect(paperPose(1, 1, 200, 300).rotate).toBe(4.5);
  expect(paperPose(2, 1, 200, 300).x).toBeCloseTo(-13, 5);
});

test("sketchLines are stable for a note and fit the paper", () => {
  const a = sketchLines("a/b.md", 190, 200);
  expect(sketchLines("a/b.md", 190, 200)).toEqual(a);
  expect(sketchLines("a/c.md", 190, 200)).not.toEqual(a);
  expect(a.rows.every((row) => row.width <= 166 && row.y < 186)).toBe(true);
});

test("allFolders and parentOf feed the move list", () => {
  expect(allFolders(tree).map((node) => node.rel)).toEqual(["work", "work/app"]);
  expect(parentOf("work/app/plan.md")).toBe("work/app");
  expect(parentOf("root.md")).toBe("");
});

test("previewBlocks joins hard-wrapped list items and quotes", () => {
  const md = "- first line\n  carries on\n- second\n\nparagraph\n> quoted\n> more\nlazy tail";
  expect(previewBlocks(md, "T")).toEqual([
    { kind: "item", marker: "bullet", label: "", depth: 0, text: "first line carries on" },
    { kind: "item", marker: "bullet", label: "", depth: 0, text: "second" },
    { kind: "text", text: "paragraph" },
    { kind: "quote", text: "quoted more lazy tail" },
  ]);
});
