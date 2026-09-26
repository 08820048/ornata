import { expect, test } from "bun:test";
import { diffLines } from "../src/lib/diff";

const kinds = (rows: { kind: string }[]) => rows.map((r) => r.kind);

test("identical input yields only same rows", () => {
  const rows = diffLines("a\nb\nc", "a\nb\nc");
  expect(kinds(rows)).toEqual(["same", "same", "same"]);
});

test("a middle edit is localized between the common prefix and suffix", () => {
  const rows = diffLines("a\nb\nc\nd", "a\nX\nc\nd");
  expect(rows).toEqual([
    { kind: "same", text: "a" },
    { kind: "del", text: "b" },
    { kind: "add", text: "X" },
    { kind: "same", text: "c" },
    { kind: "same", text: "d" },
  ]);
});

test("additions and removals across paragraphs", () => {
  const rows = diffLines("one\ntwo", "one\nthree\nfour");
  expect(kinds(rows)).toEqual(["same", "del", "add", "add"]);
});

test("empty inputs", () => {
  expect(diffLines("", "a\nb")).toEqual([
    { kind: "add", text: "a" },
    { kind: "add", text: "b" },
  ]);
  expect(diffLines("a\nb", "")).toEqual([
    { kind: "del", text: "a" },
    { kind: "del", text: "b" },
  ]);
});

test("oversized middles fall back to a whole-block replace", () => {
  const big = Array.from({ length: 1500 }, (_, i) => `line${i}`).join("\n");
  const rows = diffLines(`head\n${big}\ntail`, `head\nchanged\ntail`);
  // The common head/tail stay; the oversized middle is del-then-add.
  expect(rows[0]).toEqual({ kind: "same", text: "head" });
  expect(rows.at(-1)).toEqual({ kind: "same", text: "tail" });
  expect(rows[1]).toEqual({ kind: "del", text: "line0" });
  expect(rows.at(-3)).toEqual({ kind: "del", text: "line1499" });
  expect(rows.filter((r) => r.kind === "add")).toEqual([{ kind: "add", text: "changed" }]);
});
