import { describe, expect, test } from "bun:test";
import { collapseRange, foldRanges } from "../src/lib/codeFold";

const RUST = `impl A {
    fn run(self) {
        match self {
            X => 1,
        }
    }

    fn other() {}
}`;

describe("foldRanges", () => {
  test("a line folds over the deeper lines below it, leaving the closing line", () => {
    const folds = foldRanges(RUST);
    const headers = folds.map((f) => RUST.slice(f.lineStart, f.from));
    expect(headers).toEqual(["impl A {", "    fn run(self) {", "        match self {"]);
    const outer = folds[0];
    // hides through `    fn other() {}`, not the final `}`
    expect(RUST.slice(outer.to)).toBe("\n}");
    expect(outer.lines).toBe(7);
    const inner = folds[2];
    expect(RUST.slice(inner.to)).toContain("\n        }");
    expect(RUST.slice(inner.from, inner.to)).toBe("\n            X => 1,");
  });

  test("blank lines inside a body are hidden with it, trailing ones are not", () => {
    const text = "a:\n  one\n\n  two\n\nb";
    const [fold] = foldRanges(text);
    expect(text.slice(fold.from, fold.to)).toBe("\n  one\n\n  two");
    expect(text.slice(fold.to)).toBe("\n\nb");
  });

  test("flat code and single lines have nothing to fold", () => {
    expect(foldRanges("a\nb\nc")).toEqual([]);
    expect(foldRanges("")).toEqual([]);
    expect(foldRanges("only")).toEqual([]);
  });

  test("tabs count as indentation", () => {
    const [fold] = foldRanges("if x:\n\ty = 1\n\tz = 2\nafter");
    expect(fold.lines).toBe(2);
  });
});

describe("collapseRange", () => {
  test("hides everything after the first line", () => {
    const text = "first\nsecond\nthird";
    const range = collapseRange(text)!;
    expect(text.slice(0, range.from)).toBe("first");
    expect(range.to).toBe(text.length);
    expect(range.lines).toBe(2);
  });

  test("a one-line block cannot collapse", () => {
    expect(collapseRange("single")).toBeNull();
  });
});
