import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readdirSync, readFileSync } from "node:fs";

mock.module("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p, invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => undefined, emit: async () => undefined }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async () => undefined, openPath: async () => undefined }));

let Editor: typeof import("@tiptap/core").Editor;
let createExtensions: typeof import("../src/components/editor/extensions").createExtensions;

beforeAll(async () => {
  GlobalRegistrator.register();
  ({ Editor } = await import("@tiptap/core"));
  ({ createExtensions } = await import("../src/components/editor/extensions"));
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

/** The guide source as `guide.rs` writes it: `note:` links encoded. */
const asWritten = (source: string) =>
  source.replace(/\]\(note:([^)]+)\)/g, (_, rel: string) => `](${rel.split("/").map(encodeURIComponent).join("/")})`);

/** Ignore what the editor is free to change: blank lines, trailing spaces,
 *  table padding. */
const normalize = (markdown: string) =>
  markdown
    .split("\n")
    .map((line) => (line.startsWith("|") ? line.replace(/ *\| */g, "|").replace(/-{3,}/g, "---") : line.trimEnd()))
    .filter((line) => line !== "")
    .join("\n");

// The getting-started notes (src-tauri/guide) are the first thing a new user
// edits; saving one must not drop anything the guide wrote.
describe("getting-started notes", () => {
  for (const lang of ["en", "zh"]) {
    for (const file of readdirSync(`src-tauri/guide/${lang}`)) {
      test(`${lang}/${file} survives the editor`, () => {
        const markdown = asWritten(readFileSync(`src-tauri/guide/${lang}/${file}`, "utf8"));
        const editor = new Editor({
          element: document.createElement("div"),
          extensions: createExtensions(""),
          content: markdown,
          contentType: "markdown",
        } as never);
        const saved = (editor as unknown as { getMarkdown(): string }).getMarkdown();
        expect(normalize(saved)).toBe(normalize(markdown));
        editor.destroy();
      });
    }
  }
});
