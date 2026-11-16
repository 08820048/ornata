import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

mock.module("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p, invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => undefined, emit: async () => undefined }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async () => undefined, openPath: async () => undefined }));

let Editor: typeof import("@tiptap/core").Editor;
let createExtensions: typeof import("../src/components/editor/extensions").createExtensions;
let menu: typeof import("../src/components/editor/tableMenu");
let handles: typeof import("../src/components/editor/tableHandles");

beforeAll(async () => {
  GlobalRegistrator.register();
  ({ Editor } = await import("@tiptap/core"));
  ({ createExtensions } = await import("../src/components/editor/extensions"));
  menu = await import("../src/components/editor/tableMenu");
  handles = await import("../src/components/editor/tableHandles");
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const TABLE = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";

function open(markdown = TABLE) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: createExtensions(""),
    content: markdown,
    contentType: "markdown",
  } as never);
  return editor;
}

/** Put the caret in the cell whose text is `text`. */
function caretIn(editor: InstanceType<typeof Editor>, text: string) {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) at = pos;
  });
  editor.commands.setTextSelection(at);
}

const rows = (editor: InstanceType<typeof Editor>) =>
  (editor as unknown as { getMarkdown(): string }).getMarkdown().trim().split("\n");

describe("table menu", () => {
  test("aligning a column marks every cell of it and reaches the Markdown", () => {
    const editor = open();
    caretIn(editor, "4");
    expect(menu.columnAlign(editor)).toBeNull();
    menu.setColumnAlign(editor, "right");
    expect(menu.columnAlign(editor)).toBe("right");
    expect(rows(editor)[1].replace(/\s+/g, "")).toBe("|---|---:|");
    caretIn(editor, "A");
    menu.setColumnAlign(editor, "center");
    expect(rows(editor)[1].replace(/\s+/g, "")).toBe("|:---:|---:|");
    // Left is the default, written as no marker at all.
    menu.setColumnAlign(editor, null);
    expect(rows(editor)[1].replace(/\s+/g, "")).toBe("|---|---:|");
    editor.destroy();
  });

  test("an aligned column is read back from Markdown", () => {
    const editor = open("| A | B |\n| :---: | ---: |\n| 1 | 2 |");
    caretIn(editor, "1");
    expect(menu.columnAlign(editor)).toBe("center");
    caretIn(editor, "2");
    expect(menu.columnAlign(editor)).toBe("right");
    editor.destroy();
  });

  test("the menu inserts and deletes rows and columns around the clicked cell", () => {
    const editor = open();
    caretIn(editor, "1");
    const pick = (label: string) => menu.tableMenuItems(editor).find((item) => item.label === label)!.onSelect();
    pick("Insert row above");
    expect(rows(editor)).toHaveLength(5);
    expect(rows(editor)[3].replace(/\s+/g, "")).toBe("|1|2|");
    caretIn(editor, "2");
    pick("Insert column left");
    expect(rows(editor)[0].replace(/\s+/g, "")).toBe("|A||B|");
    caretIn(editor, "3");
    pick("Delete row");
    expect(rows(editor).some((row) => row.includes("3"))).toBe(false);
    caretIn(editor, "B");
    pick("Delete column");
    expect(rows(editor)[0].replace(/\s+/g, "")).toBe("|A||");
    pick("Delete table");
    expect(editor.state.doc.firstChild?.type.name).not.toBe("table");
    editor.destroy();
  });

  test("the menu offers only the alignments not already in effect", () => {
    const editor = open();
    caretIn(editor, "1");
    const labels = () => menu.tableMenuItems(editor).map((item) => item.label);
    expect(labels()).not.toContain("Align column left");
    expect(labels()).toContain("Align column center");
    menu.setColumnAlign(editor, "center");
    expect(labels()).toContain("Align column left");
    expect(labels()).not.toContain("Align column center");
    editor.destroy();
  });

  test("the edge bars add after the last row and the last column", () => {
    const editor = open();
    const table = editor.view.dom.querySelector("table")!;
    const row = handles.lastCellPos(editor.view, table, "row")!;
    const column = handles.lastCellPos(editor.view, table, "column")!;
    expect(editor.state.doc.nodeAt(row)?.textContent).toBe("4");
    expect(editor.state.doc.nodeAt(column)?.textContent).toBe("B");
    editor.destroy();
  });

  test("Tab in the last cell adds a row", () => {
    const editor = open();
    caretIn(editor, "4");
    editor.commands.keyboardShortcut("Tab");
    expect(rows(editor)).toHaveLength(5);
    editor.destroy();
  });
});
