import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The extension list pulls in Tauri helpers the editor never calls here.
mock.module("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
  invoke: async () => null,
}));
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

/** Type `text` the way the keyboard does, so input rules run. */
function type(editor: InstanceType<typeof Editor>, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, char));
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
  }
}

function make(content: string) {
  return new Editor({
    element: document.createElement("div"),
    extensions: createExtensions("/vault"),
    content,
  });
}

const topTypes = (editor: InstanceType<typeof Editor>) =>
  (editor.getJSON().content ?? []).map((node) => node.type);

describe("StarTask input rule", () => {
  test("* then space at the start of a paragraph becomes a to-do", () => {
    const editor = make("<p></p>");
    editor.commands.focus();
    type(editor, "* ");
    expect(topTypes(editor)[0]).toBe("taskList");
    type(editor, "buy milk");
    expect(editor.getText()).toContain("buy milk");
    editor.destroy();
  });

  test("- and + still make bullets", () => {
    for (const marker of ["- ", "+ "]) {
      const editor = make("<p></p>");
      editor.commands.focus();
      type(editor, marker);
      expect(topTypes(editor)[0]).toBe("bulletList");
      editor.destroy();
    }
  });

  test("a star in the middle of text, or emphasis, is untouched", () => {
    const editor = make("<p></p>");
    editor.commands.focus();
    type(editor, "2 * ");
    expect(topTypes(editor)).toEqual(["paragraph"]);
    editor.destroy();
  });

  test("inside a bullet list the rule stands aside", () => {
    const editor = make("<ul><li><p></p></li></ul>");
    editor.commands.setTextSelection(3); // inside the first list item
    expect(editor.isActive("bulletList")).toBe(true);
    type(editor, "* ");
    expect(topTypes(editor)).not.toContain("taskList");
    editor.destroy();
  });
});
