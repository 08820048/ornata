import { expect, test } from "bun:test";
import { nodePos } from "../src/lib/nodePos";

test("nodePos returns the position, or null when it is unknown or throws", () => {
  expect(nodePos(() => 12)).toBe(12);
  expect(nodePos(() => undefined)).toBeNull();
  expect(
    nodePos(() => {
      throw new TypeError("undefined is not an object (evaluating 'cur.size')");
    }),
  ).toBeNull();
});
