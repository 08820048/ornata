import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string) {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("\n}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
}

// A widget inside a heading that is not user-select: text makes WebKit remove
// the whole <h2> when an IME commit deletes its pre-edit text; ProseMirror reads
// that as an Enter key, splitting the heading and sending the typed text below
// it. Only the built CSS gets the -webkit- prefix, so `bun tauri dev` hides it.
test("the heading fold widget stays selectable like the editor", () => {
  expect(rule(".prose-note .heading-fold")).toMatch(/\n\s+user-select: text;/);
});
