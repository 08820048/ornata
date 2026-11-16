import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

mock.module("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p, invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => undefined, emit: async () => undefined }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async () => undefined, openPath: async () => undefined }));

let Editor: typeof import("@tiptap/core").Editor;
let createExtensions: typeof import("../src/components/editor/extensions").createExtensions;
let notes: typeof import("../src/components/editor/footnotes");

beforeAll(async () => {
  GlobalRegistrator.register();
  ({ Editor } = await import("@tiptap/core"));
  ({ createExtensions } = await import("../src/components/editor/extensions"));
  notes = await import("../src/components/editor/footnotes");
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
  (editor as unknown as { getMarkdown(): string }).getMarkdown().trim().replace(/ +\n/g, "\n");
const textAt = (editor: InstanceType<typeof Editor>, range: { from: number; to: number }) =>
  editor.state.doc.textBetween(range.from, range.to);

const DOC = "Claim one[^b] and two[^a], again[^b].\n\n[^a]: First **bold** note.\n[^b]: Second note.";

describe("footnotes", () => {
  test("references and definitions are found, numbered by first reference", () => {
    const editor = open(DOC);
    const found = notes.scanFootnotes(editor.state.doc);
    expect(found.refs.map((ref) => textAt(editor, ref))).toEqual(["[^b]", "[^a]", "[^b]"]);
    expect(found.defs.map((def) => [def.id, def.text, textAt(editor, def)])).toEqual([
      ["a", "First bold note.", "[^a]: "],
      ["b", "Second note.", "[^b]: "],
    ]);
    expect([...found.numbers]).toEqual([["b", 1], ["a", 2]]);
    editor.destroy();
  });

  test("a marker inside code is left alone", () => {
    const editor = open("Inline `[^x]` and\n\n```\n[^y]: not a note\n```\n\nreal[^z]");
    const found = notes.scanFootnotes(editor.state.doc);
    expect(found.refs.map((ref) => ref.id)).toEqual(["z"]);
    expect(found.defs).toEqual([]);
    editor.destroy();
  });

  test("a definition must open its line; mid-line it is a reference", () => {
    const editor = open("see [^a]: not a definition");
    const found = notes.scanFootnotes(editor.state.doc);
    expect(found.defs).toEqual([]);
    expect(found.refs.map((ref) => ref.id)).toEqual(["a"]);
    editor.destroy();
  });

  test("an unreferenced definition is numbered after the referenced ones", () => {
    const editor = open("text[^2]\n\n[^1]: orphan\n[^2]: used");
    expect([...notes.scanFootnotes(editor.state.doc).numbers]).toEqual([["2", 1], ["1", 2]]);
    editor.destroy();
  });

  test("a one-word definition is not read as a link definition", () => {
    const editor = open("See[^1].\n\n[^1]: word");
    expect(markdownOf(editor)).toBe("See[^1].\n\n[^1]: word");
    expect(notes.scanFootnotes(editor.state.doc).defs[0].text).toBe("word");
    editor.destroy();
  });

  test("the Markdown is saved as typed", () => {
    const editor = open(DOC);
    expect(markdownOf(editor)).toBe(DOC);
    editor.destroy();
  });

  test("markers hide behind numbers until the caret is in one", () => {
    const editor = open("a[^1] b\n\n[^1]: note");
    const classes = () =>
      notes
        .footnoteDecorations(editor.state, notes.scanFootnotes(editor.state.doc))
        .find()
        .map((d) => (d as unknown as { type: { attrs?: { class?: string } } }).type.attrs?.class)
        .filter(Boolean);
    editor.commands.setTextSelection(1);
    expect(classes()).toEqual(["footnote-hidden", "footnote-hidden"]);
    editor.commands.setTextSelection(4);
    expect(classes()).toEqual(["footnote-raw", "footnote-hidden"]);
    editor.destroy();
  });

  test("inserting a footnote adds a reference and a definition with the next free number", () => {
    const editor = open("First[^1] and more\n\n[^1]: one");
    editor.commands.setTextSelection(15);
    notes.insertFootnote(editor);
    expect(markdownOf(editor)).toBe("First[^1] and [^2]more\n\n[^1]: one\n\n[^2]:");
    // The caret waits at the end of the new definition.
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1);
    expect(notes.nextFootnoteId(notes.scanFootnotes(editor.state.doc))).toBe("3");
    editor.destroy();
  });
});
