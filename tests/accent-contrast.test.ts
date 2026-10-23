import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

/** Token values from the block opened by `opener`. */
function blockTokens(opener: string) {
  const start = css.indexOf(opener);
  const body = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
}

const PAPER = ':root:is([data-palette="paper"], [data-palette="paper-textured"]) {';
const BLOCKS = {
  light: ":root {",
  dark: "\n.dark {",
  paper: PAPER,
  basalt: ':root[data-palette="basalt"] {',
  "tokyo-techno": ':root[data-palette="tokyo-techno"] {',
  "early-ember": ':root[data-palette="early-ember"] {',
  "neon-noir": ':root[data-palette="neon-noir"] {',
} as const;

/** A mode's tokens; the palettes override the base light/dark ones. */
function tokens(name: keyof typeof BLOCKS) {
  const base = blockTokens(name === "light" || name === "paper" ? BLOCKS.light : BLOCKS.dark);
  return { ...base, ...blockTokens(BLOCKS[name]) };
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("accent colour", () => {
  for (const name of Object.keys(BLOCKS) as Array<keyof typeof BLOCKS>) {
    const t = tokens(name);

    test(`${name}: links and the caret read clearly on the page`, () => {
      expect(t.accent).toBeTruthy();
      expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(4.5);
    });

    test(`${name}: the tick on a checked box is legible`, () => {
      expect(contrast(t["accent-ink"], t.accent)).toBeGreaterThanOrEqual(4.5);
    });

    test(`${name}: the accent is not mistaken for the graph's green or the danger red`, () => {
      expect(t.accent).not.toBe(t["graph-4"]);
      expect(t.accent).not.toBe(t.danger);
      expect(t.accent).not.toBe(t.success);
    });
  }
});
