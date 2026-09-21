import { expect, test, describe } from "bun:test";
import {
  rankCorners,
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
      active = stepSpring(s, 1 / 60, 0.125);
      frames += 1;
    }
    expect(active).toBe(false);
    expect(Math.abs(s.offset)).toBeLessThan(0.01);
    // A 125ms animation should settle well under a second of frames.
    expect(frames).toBeLessThan(60);
  });

  test("shorter animation settles sooner", () => {
    const short = spring(100);
    const long = spring(100);
    let shortFrames = 0;
    let longFrames = 0;
    while (stepSpring(short, 1 / 60, 0.05) && shortFrames < 240) shortFrames += 1;
    while (stepSpring(long, 1 / 60, 0.125) && longFrames < 240) longFrames += 1;
    expect(shortFrames).toBeLessThan(longFrames);
  });

  test("zero dt keeps the offset and reports activity", () => {
    const s = spring(5);
    expect(stepSpring(s, 0, 0.125)).toBe(true);
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
