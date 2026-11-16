import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

mock.module("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p, invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => undefined, emit: async () => undefined }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async () => undefined, openPath: async () => undefined }));

let Editor: typeof import("@tiptap/core").Editor;
let createExtensions: typeof import("../src/components/editor/extensions").createExtensions;
let callout: typeof import("../src/components/editor/callout");

beforeAll(async () => {
  GlobalRegistrator.register();
  ({ Editor } = await import("@tiptap/core"));
  ({ createExtensions } = await import("../src/components/editor/extensions"));
  callout = await import("../src/components/editor/callout");
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const open = (markdown: string) =>
  new Editor({
    element: document.createElement("div"),
    extensions: createExtensions(""),
    content: markdown,
    contentType: "markdown",
  } as never);
const markdownOf = (editor: InstanceType<typeof Editor>) =>
  (editor as unknown as { getMarkdown(): string }).getMarkdown().trim();
const first = (editor: InstanceType<typeof Editor>) => callout.calloutOf(editor.state.doc.firstChild!);
const classes = (editor: InstanceType<typeof Editor>) =>
  callout
    .calloutDecorations(editor.state)
    .find()
    .map((d) => (d as unknown as { type: { attrs?: { class?: string } } }).type.attrs?.class)
    .filter(Boolean);

describe("callouts", () => {
  test("a quote opening with [!type] is a callout; a plain quote is not", () => {
    const editor = open("> [!WARNING] Mind the gap\n> body");
    expect(first(editor)).toEqual({ kind: "warning", name: "warning", markerLength: 10, titleEnd: 23 });
    editor.destroy();
    const plain = open("> just a quote");
    expect(first(plain)).toBeNull();
    expect(classes(plain)).toEqual([]);
    plain.destroy();
  });

  test("the marker must open the quote and be a whole word", () => {
    for (const md of ["> text [!note] later", "> [!note]stuck", "> [note] no bang", "[!note] not a quote"]) {
      const editor = open(md);
      expect(first(editor)).toBeNull();
      editor.destroy();
    }
  });

  test("Obsidian's names and fold signs are understood", () => {
    const info = open("> [!info]- Folded title\n> x");
    expect(first(info)).toMatchObject({ kind: "note", name: "info", markerLength: 8 });
    expect(callout.calloutLabel(first(info)!)).toBe("Info");
    info.destroy();
    const bug = open("> [!bug]\n> x");
    expect(first(bug)?.kind).toBe("caution");
    bug.destroy();
    const custom = open("> [!recipe] Soup");
    expect(first(custom)?.kind).toBe("note");
    expect(callout.calloutLabel(first(custom)!)).toBe("Recipe");
    custom.destroy();
    const note = open("> [!NOTE]\n> x");
    expect(callout.calloutLabel(first(note)!)).toBe("Note");
    note.destroy();
  });

  test("the Markdown is saved as typed", () => {
    const editor = open("> [!tip] Title\n> body\n>\n> more");
    expect(markdownOf(editor).replace(/ +\n/g, "\n")).toBe("> [!tip] Title\n> body\n>\n> more");
    editor.destroy();
  });

  test("the marker hides behind the label until the caret is in it", () => {
    const editor = open("> [!note] Title\n\nafter");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(classes(editor)).toEqual(["callout", "callout-marker", "callout-title"]);
    editor.commands.setTextSelection(4);
    expect(classes(editor)).toEqual(["callout", "callout-marker-raw", "callout-title"]);
    editor.destroy();
  });

  test("a callout without a title gets no title decoration", () => {
    const editor = open("> [!note]\n> body\n\nafter");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(classes(editor)).toEqual(["callout", "callout-marker"]);
    editor.destroy();
  });

  test("callouts nest inside lists and other quotes", () => {
    const editor = open("- item\n\n  > [!tip] In a list");
    expect(classes(editor)).toContain("callout");
    editor.destroy();
  });
});
