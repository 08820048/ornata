import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

mock.module("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p, invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => undefined, emit: async () => undefined }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async () => undefined, openPath: async () => undefined }));

let Editor: typeof import("@tiptap/core").Editor;
let createExtensions: typeof import("../src/components/editor/extensions").createExtensions;
let typewriter: typeof import("../src/components/editor/typewriter");

beforeAll(async () => {
  GlobalRegistrator.register();
  ({ Editor } = await import("@tiptap/core"));
  ({ createExtensions } = await import("../src/components/editor/extensions"));
  typewriter = await import("../src/components/editor/typewriter");
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const NOTE = "# Title\n\nFirst paragraph.\n\n- one\n- two\n  - nested\n\nLast paragraph.\n";
const open = () =>
  new Editor({
    element: document.createElement("div"),
    extensions: createExtensions(""),
    content: NOTE,
    contentType: "markdown",
  } as never);

/** Put the caret inside the first text node that reads `text`. */
function caretIn(editor: InstanceType<typeof Editor>, text: string) {
  let at = -1;
  editor.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text === text) at = pos + 1;
  });
  editor.commands.setTextSelection(at);
}
const lit = (editor: InstanceType<typeof Editor>, cls: string) =>
  [...editor.view.dom.querySelectorAll(`.${cls}`)].map((el) => el.textContent);

describe("typewriter scrolling", () => {
  test("off by default: nothing is marked and the markdown is untouched", () => {
    const editor = open();
    caretIn(editor, "First paragraph.");
    expect(lit(editor, "tw-current")).toEqual([]);
    typewriter.setTypewriter(editor.view, true);
    typewriter.setTypewriter(editor.view, false);
    expect(lit(editor, "tw-current")).toEqual([]);
    expect((editor as never as { getMarkdown(): string }).getMarkdown().trim()).toBe(NOTE.trim());
    editor.destroy();
  });

  test("marks the block under the caret and follows it", () => {
    const editor = open();
    typewriter.setTypewriter(editor.view, true);
    caretIn(editor, "First paragraph.");
    expect(lit(editor, "tw-current")).toEqual(["First paragraph."]);
    caretIn(editor, "Last paragraph.");
    expect(lit(editor, "tw-current")).toEqual(["Last paragraph."]);
    expect(lit(editor, "tw-current-item")).toEqual([]);
    editor.destroy();
  });

  test("in a list the whole list is current and the innermost item is marked", () => {
    const editor = open();
    typewriter.setTypewriter(editor.view, true);
    caretIn(editor, "nested");
    expect(editor.view.dom.querySelector(".tw-current")?.tagName).toBe("UL");
    expect(lit(editor, "tw-current-item")).toEqual(["nested"]);
    caretIn(editor, "one");
    expect(lit(editor, "tw-current-item")).toEqual(["one"]);
    editor.destroy();
  });

  test("the caret's middle goes to the middle of the scroller", () => {
    const { centeredScrollTop } = typewriter;
    // caret at 700–720 in a 600px pane starting at y=100: middle is 400
    expect(centeredScrollTop({ top: 700, bottom: 720 }, { top: 100, height: 600, scrollTop: 50 })).toBe(360);
    // near the top of the note there is nothing to scroll back to
    expect(centeredScrollTop({ top: 120, bottom: 140 }, { top: 100, height: 600, scrollTop: 0 })).toBe(0);
  });
});
