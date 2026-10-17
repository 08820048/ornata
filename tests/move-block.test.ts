import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

mock.module("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p, invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => undefined, emit: async () => undefined }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async () => undefined, openPath: async () => undefined }));

let Editor: typeof import("@tiptap/core").Editor;
let createExtensions: typeof import("../src/components/editor/extensions").createExtensions;
let moveBlock: typeof import("../src/components/editor/moveBlock").moveBlock;

beforeAll(async () => {
  GlobalRegistrator.register();
  ({ Editor } = await import("@tiptap/core"));
  ({ createExtensions } = await import("../src/components/editor/extensions"));
  ({ moveBlock } = await import("../src/components/editor/moveBlock"));
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

type Ed = InstanceType<typeof Editor>;
const make = (html: string) =>
  new Editor({ element: document.createElement("div"), extensions: createExtensions("/v"), content: html });

/** Put the caret inside the first occurrence of `text`. */
function caretIn(editor: Ed, text: string) {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isText && node.text!.includes(text)) target = pos + node.text!.indexOf(text) + 1;
  });
  editor.commands.setTextSelection(target);
}

const topTexts = (editor: Ed) => (editor.getJSON().content ?? []).map((n) => n.content?.map((c) => c.text ?? "").join("") ?? n.type);
const listTexts = (editor: Ed, index = 0) =>
  ((editor.getJSON().content?.[index]?.content ?? []) as Array<{ content?: Array<{ content?: Array<{ text?: string }> }> }>).map(
    (item) => item.content?.[0]?.content?.[0]?.text,
  );

describe("moveBlock", () => {
  test("a paragraph swaps with its neighbour, and the caret stays on its text", () => {
    const editor = make("<p>one</p><p>two</p><p>three</p>");
    caretIn(editor, "two");
    editor.view.dispatch(moveBlock(editor.state, "up")!);
    expect(topTexts(editor).slice(0, 3)).toEqual(["two", "one", "three"]);
    // the caret is still inside "two", so moving again keeps going with that block
    expect(editor.state.selection.$from.parent.textContent).toBe("two");
    editor.view.dispatch(moveBlock(editor.state, "down")!);
    editor.view.dispatch(moveBlock(editor.state, "down")!);
    expect(topTexts(editor).slice(0, 3)).toEqual(["one", "three", "two"]);
    editor.destroy();
  });

  test("it stops at the ends instead of wrapping or eating the key", () => {
    const editor = make("<p>one</p><p>two</p>");
    caretIn(editor, "one");
    expect(moveBlock(editor.state, "up")).toBeNull();
    caretIn(editor, "two");
    expect(moveBlock(editor.state, "down")).toBeNull();
    editor.destroy();
  });

  test("a list item moves within its own list", () => {
    const editor = make("<p>intro</p><ul><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ul>");
    caretIn(editor, "b");
    editor.view.dispatch(moveBlock(editor.state, "up")!);
    expect(listTexts(editor, 1)).toEqual(["b", "a", "c"]);
    expect(moveBlock(editor.state, "up")).toBeNull(); // first item: the list is not left
    expect(topTexts(editor)[0]).toBe("intro");
    editor.destroy();
  });

  test("a nested item moves only among its siblings", () => {
    const editor = make(
      "<ul><li><p>parent</p><ul><li><p>x</p></li><li><p>y</p></li></ul></li><li><p>other</p></li></ul>",
    );
    caretIn(editor, "y");
    editor.view.dispatch(moveBlock(editor.state, "up")!);
    const json = JSON.stringify(editor.getJSON());
    expect(json.indexOf('"y"')).toBeLessThan(json.indexOf('"x"'));
    expect(json.indexOf('"parent"')).toBeLessThan(json.indexOf('"y"'));
    expect(json.indexOf('"x"')).toBeLessThan(json.indexOf('"other"'));
    editor.destroy();
  });

  test("a task item moves like any list item", () => {
    const editor = make('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>t1</p></li><li data-type="taskItem" data-checked="true"><p>t2</p></li></ul>');
    caretIn(editor, "t2");
    editor.view.dispatch(moveBlock(editor.state, "up")!);
    expect(listTexts(editor)).toEqual(["t2", "t1"]);
    editor.destroy();
  });

  test("a heading, a code block, and a quote move as whole blocks", () => {
    const editor = make("<h2>Title</h2><pre><code>a\nb</code></pre><blockquote><p>q</p></blockquote>");
    caretIn(editor, "a");
    editor.view.dispatch(moveBlock(editor.state, "up")!);
    expect(editor.getJSON().content!.map((n) => n.type).slice(0, 3)).toEqual(["codeBlock", "heading", "blockquote"]);
    caretIn(editor, "q");
    editor.view.dispatch(moveBlock(editor.state, "up")!);
    expect(editor.getJSON().content!.map((n) => n.type).slice(0, 3)).toEqual(["codeBlock", "blockquote", "heading"]);
    editor.destroy();
  });

  test("one undo puts it back", () => {
    const editor = make("<p>one</p><p>two</p>");
    caretIn(editor, "two");
    editor.view.dispatch(moveBlock(editor.state, "up")!);
    editor.commands.undo();
    expect(topTexts(editor).slice(0, 2)).toEqual(["one", "two"]);
    editor.destroy();
  });

  test("⌥↑ and ⌥↓ are bound as editor shortcuts", () => {
    const editor = make("<p>one</p><p>two</p>");
    caretIn(editor, "two");
    const press = (key: string) =>
      editor.view.someProp("handleKeyDown", (f) =>
        f(editor.view, new window.KeyboardEvent("keydown", { key, altKey: true, bubbles: true, cancelable: true }) as unknown as KeyboardEvent),
      );
    expect(press("ArrowUp")).toBe(true);
    expect(topTexts(editor).slice(0, 2)).toEqual(["two", "one"]);
    expect(press("ArrowDown")).toBe(true);
    expect(topTexts(editor).slice(0, 2)).toEqual(["one", "two"]);
    editor.destroy();
  });
});
