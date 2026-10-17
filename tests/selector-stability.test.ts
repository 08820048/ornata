import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** A zustand selector that returns a fresh array/object each call makes React
 *  re-render forever ("Maximum update depth exceeded"). Select the stable
 *  value and apply the fallback outside the hook. */
test("store selectors never fall back to a fresh array or object", () => {
  const bad = /use(?:Tabs|Vault|Ui|Nav|Agent|Locale|Updater)\(\s*\(?\w*\)?\s*=>[^;\n]*(?:\?\?|\|\|)\s*(?:\[\s*\]|\{\s*\})/;
  const offenders = walk(path.join(import.meta.dir, "../src")).filter((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .some((line) => bad.test(line)),
  );
  expect(offenders).toEqual([]);
});
