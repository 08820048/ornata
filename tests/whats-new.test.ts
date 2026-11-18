import { describe, expect, test } from "bun:test";
import {
  compareVersions,
  localized,
  releaseNotes,
  releasesBetween,
  takeWhatsNew,
  type Release,
} from "../src/lib/whatsNew";
import { RELEASES } from "../site/lib/releases";
import packageInfo from "../package.json";

const release = (version: string): Release => ({
  version,
  date: "",
  dateTime: "2026-01-01",
  summary: `summary ${version}`,
  changes: [`change ${version}`],
});
const RELS = ["0.12.0", "0.13.0", "0.13.1", "0.14.0"].map(release);

function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

describe("what's new", () => {
  test("versions compare numerically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.13.1", "0.13.1")).toBe(0);
    expect(compareVersions("0.13.0", "0.13.1")).toBeLessThan(0);
  });

  test("every release since the last seen one, newest first", () => {
    expect(releasesBetween("0.12.0", "0.14.0", RELS).map((r) => r.version)).toEqual([
      "0.14.0",
      "0.13.1",
      "0.13.0",
    ]);
  });

  test("an update shows what changed and is shown once", () => {
    const storage = memory({ "ornata:lastSeenVersion": "0.13.0" });
    expect(takeWhatsNew("0.14.0", false, storage, RELS).map((r) => r.version)).toEqual(["0.14.0", "0.13.1"]);
    expect(takeWhatsNew("0.14.0", false, storage, RELS)).toEqual([]);
  });

  test("a fresh install shows nothing but remembers the version", () => {
    const storage = memory();
    expect(takeWhatsNew("0.14.0", true, storage, RELS)).toEqual([]);
    expect(storage.map.get("ornata:lastSeenVersion")).toBe("0.14.0");
  });

  test("a machine from before this feature gets the current notes", () => {
    expect(takeWhatsNew("0.14.0", false, memory(), RELS).map((r) => r.version)).toEqual(["0.14.0"]);
  });

  test("a downgrade shows nothing", () => {
    expect(takeWhatsNew("0.13.0", false, memory({ "ornata:lastSeenVersion": "0.14.0" }), RELS)).toEqual([]);
  });

  test("the palette falls back to the newest release before a dev version", () => {
    expect(releaseNotes("0.13.5", RELS).map((r) => r.version)).toEqual(["0.13.1"]);
  });

  test("Chinese text when there is some, English otherwise", () => {
    const zh = { ...release("1.0.0"), zh: { summary: "摘要", changes: ["改动"] } };
    expect(localized(zh, "zh-CN").summary).toBe("摘要");
    expect(localized(release("1.0.0"), "zh-CN").summary).toBe("summary 1.0.0");
  });

  test("the app's own version has notes in both languages", () => {
    const own = RELEASES.find((r) => r.version === packageInfo.version);
    expect(own).toBeDefined();
    expect(own?.zh).toBeDefined();
  });
});
