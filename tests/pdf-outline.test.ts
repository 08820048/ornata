import { expect, test } from "bun:test";
import { outlineFromHeadings } from "../src/lib/pdfOutline";

test("outline nests headings under the nearest shallower one", () => {
  expect(
    outlineFromHeadings([
      { level: 1, text: "Intro" },
      { level: 2, text: " Why\n  now " },
      { level: 3, text: "Deep" },
      { level: 2, text: "How" },
      { level: 1, text: "Next" },
      { level: 3, text: "Skipped a level" },
    ]),
  ).toEqual([
    { text: "Intro", parent: -1 },
    { text: "Why now", parent: 0 },
    { text: "Deep", parent: 1 },
    { text: "How", parent: 0 },
    { text: "Next", parent: -1 },
    { text: "Skipped a level", parent: 4 },
  ]);
});

test("outline drops blank headings and handles notes starting below h1", () => {
  expect(
    outlineFromHeadings([
      { level: 3, text: "a" },
      { level: 2, text: "   " },
      { level: 2, text: "b" },
      { level: 3, text: "c" },
    ]),
  ).toEqual([
    { text: "a", parent: -1 },
    { text: "b", parent: -1 },
    { text: "c", parent: 1 },
  ]);
});
