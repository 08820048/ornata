import { expect, test, describe } from "bun:test";
import {
  cornerLength,
  rankCorners,
  roundedPath,
  stepSpring,
  type Spring,
} from "../src/components/editor/cursorMotion";

function spring(offset: number): Spring {
  return { offset, velocity: 0 };
}

describe("stepSpring", () => {
  test("converges to rest and reports inactive", () => {
    const s = spring(100);
    let active = true;
    let frames = 0;
    while (active && frames < 240) {
      active = stepSpring(s, 1 / 60, 0.1);
      frames += 1;
    }
    expect(active).toBe(false);
    expect(Math.abs(s.offset)).toBeLessThan(0.01);
    // A 100ms animation should settle well under a second of frames.
    expect(frames).toBeLessThan(60);
  });

  test("shorter animation settles sooner", () => {
    const short = spring(100);
    const long = spring(100);
    let shortFrames = 0;
    let longFrames = 0;
    while (stepSpring(short, 1 / 60, 0.04) && shortFrames < 240) shortFrames += 1;
    while (stepSpring(long, 1 / 60, 0.1) && longFrames < 240) longFrames += 1;
    expect(shortFrames).toBeLessThan(longFrames);
  });

  test("zero dt keeps the offset and reports activity", () => {
    const s = spring(5);
    expect(stepSpring(s, 0, 0.1)).toBe(true);
    expect(s.offset).toBe(5);
  });

  test("degenerate timing resets instead of producing NaN", () => {
    const s = spring(5);
    expect(stepSpring(s, 0.2, 0.1)).toBe(false);
    expect(s.offset).toBe(0);
    expect(s.velocity).toBe(0);
  });

  test("non-finite length resets", () => {
    const s = spring(5);
    expect(stepSpring(s, 1 / 60, Number.NaN)).toBe(false);
    expect(s.offset).toBe(0);
  });
});

describe("rankCorners", () => {
  test("moving right leads with the right-side corners", () => {
    const ranks = rankCorners(100, 0);
    // Corner order: TL=0, TR=1, BR=2, BL=3.
    expect(new Set([ranks[1], ranks[2]])).toEqual(new Set([0, 1]));
    expect(new Set([ranks[0], ranks[3]])).toEqual(new Set([2, 3]));
  });

  test("moving up-left leads with the top-left corner", () => {
    const ranks = rankCorners(-100, -100);
    expect(ranks[0]).toBe(0);
  });

  test("no travel yields a stable permutation", () => {
    expect([...rankCorners(0, 0)].sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("roundedPath", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  test("closes through four quadratic corners", () => {
    const d = roundedPath(square, 2);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/Q/g)).toHaveLength(4);
    expect(d.startsWith("M0.00,2.00")).toBe(true);
  });

  test("never rounds past the midpoint of an edge", () => {
    const d = roundedPath(square, 100);
    expect(d.startsWith("M0.00,5.00")).toBe(true);
  });

  test("a zero radius keeps the corners sharp", () => {
    expect(roundedPath(square, 0).startsWith("M0.00,0.00 Q0.00,0.00")).toBe(true);
  });
});

describe("cornerLength", () => {
  test("the leading corner takes longest, the two trailing ones the least", () => {
    const lengths = [0, 1, 2, 3].map((rank) => cornerLength(rank, 0.1));
    expect(lengths[0]).toBeCloseTo(0.1);
    expect(lengths[1]).toBeCloseTo((0.1 + lengths[2]) / 2);
    expect(lengths[2]).toBeLessThan(lengths[1]);
    expect(lengths[3]).toBe(lengths[2]);
  });
});
