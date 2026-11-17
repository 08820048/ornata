import { expect, test } from "bun:test";
import { previewPlace, previewTarget } from "../src/lib/linkPreview";
import type { TreeNode } from "../src/lib/types";

const note = (rel: string): TreeNode => ({ name: rel.split("/").pop()!.replace(/\.md$/, ""), rel, kind: "note", modifiedMs: 0 });
const tree: TreeNode[] = [
  { name: "work", rel: "work", kind: "folder", modifiedMs: 0, children: [note("work/My Plan.md")] },
  note("Home.md"),
];
const here = { kind: "vault", rel: "Home.md" } as const;

test("a link to another existing note has a preview", () => {
  expect(previewTarget("work/My%20Plan.md", tree, here)?.rel).toBe("work/My Plan.md");
  expect(previewTarget("work/my%20plan.md#Goals", tree, here)?.rel).toBe("work/My Plan.md");
});

test("web links, anchors, missing notes and the note itself have none", () => {
  expect(previewTarget("https://ornata.app", tree, here)).toBeNull();
  expect(previewTarget("mailto:a@b.c", tree, here)).toBeNull();
  expect(previewTarget("#heading", tree, here)).toBeNull();
  expect(previewTarget("gone.md", tree, here)).toBeNull();
  expect(previewTarget("Home.md", tree, here)).toBeNull();
  expect(previewTarget(null, tree, here)).toBeNull();
});

test("the card sits under the link, or above it near the bottom, and stays on screen", () => {
  const viewport = { width: 1000, height: 700 };
  expect(previewPlace({ left: 200, top: 100, bottom: 120 }, viewport)).toEqual({ left: 200, top: 128 });
  expect(previewPlace({ left: 200, top: 600, bottom: 620 }, viewport)).toEqual({ left: 200, top: 362 });
  expect(previewPlace({ left: 900, top: 100, bottom: 120 }, viewport).left).toBe(652);
  expect(previewPlace({ left: -40, top: 100, bottom: 120 }, viewport).left).toBe(8);
});
