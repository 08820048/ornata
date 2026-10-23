import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

mock.module("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p, invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => undefined, emit: async () => undefined }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
mock.module("@tauri-apps/plugin-opener", () => ({ openUrl: async () => undefined, openPath: async () => undefined }));

let Editor: typeof import("@tiptap/core").Editor;
let createExtensions: typeof import("../src/components/editor/extensions").createExtensions;
let cursorPosition: typeof import("../src/components/editor/cursorPosition").cursorPosition;

beforeAll(async () => {
  GlobalRegistrator.register();
  ({ Editor } = await import("@tiptap/core"));
  ({ createExtensions } = await import("../src/components/editor/extensions"));
  ({ cursorPosition } = await import("../src/components/editor/cursorPosition"));
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const make = (html: string) =>
  new Editor({ element: document.createElement("div"), extensions: createExtensions("/v"), content: html });

describe("cursorPosition", () => {
  test("counts blocks as lines and offset as column", () => {
    const editor = make("<p>one</p><p>two words</p><ul><li><p>item</p></li></ul>");
    const at = (needle: string, extra = 0) => {
      let found = -1;
      editor.state.doc.descendants((node, pos) => {
        if (found < 0 && node.isText && node.text!.includes(needle)) found = pos + node.text!.indexOf(needle) + extra;
      });
      return cursorPosition(editor.state.doc, found);
    };
    expect(at("one")).toEqual({ line: 1, col: 1 });
    expect(at("two", 3)).toEqual({ line: 2, col: 4 });
    expect(at("item", 4)).toEqual({ line: 3, col: 5 });
    editor.destroy();
  });

  test("newlines inside a code block advance the line", () => {
    const editor = make("<p>a</p><pre><code>x\ny\nzz</code></pre><p>after</p>");
    let code = -1;
    let after = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "codeBlock") code = pos + 1;
      if (node.isText && node.text === "after") after = pos;
    });
    expect(cursorPosition(editor.state.doc, code + 6)).toEqual({ line: 4, col: 3 });
    expect(cursorPosition(editor.state.doc, after)).toEqual({ line: 5, col: 1 });
    editor.destroy();
  });
});
