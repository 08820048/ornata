import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

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

const make = (markdown: string) =>
  new Editor({ element: document.createElement("div"), extensions: createExtensions("/vault"), content: markdown, contentType: "markdown" });

const items = (editor: InstanceType<typeof Editor>) => {
  const out: Array<{ checked: boolean; status: string | null; text: string }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "taskItem") out.push({ checked: node.attrs.checked, status: node.attrs.status, text: node.firstChild?.textContent ?? "" });
  });
  return out;
};

describe("task statuses", () => {
  test("[/] and [-] load as statuses, with their text intact", () => {
    const editor = make("- [ ] todo\n- [/] doing #bug\n- [x] done\n- [-] canceled\n  - note\n- plain bullet\n");
    expect(items(editor)).toEqual([
      { checked: false, status: null, text: "todo" },
      { checked: false, status: "doing", text: "doing #bug" },
      { checked: true, status: null, text: "done" },
      { checked: false, status: "canceled", text: "canceled" },
    ]);
    editor.destroy();
  });

  test("they save back as written", () => {
    const md = "- [ ] a\n\n- [/] b\n\n- [x] c\n\n- [-] d\n";
    const editor = make(md);
    const out = editor.getMarkdown();
    for (const line of ["- [ ] a", "- [/] b", "- [x] c", "- [-] d"]) expect(out).toContain(line);
    expect(out).not.toContain("\uE000");
    editor.destroy();
  });

  test("text after the list is not swallowed", () => {
    const editor = make("- [/] doing\n\nafter\n");
    expect(editor.getText()).toContain("after");
    editor.destroy();
  });

  test("ticking the box clears the status", () => {
    const editor = make("- [/] doing\n");
    const input = editor.view.dom.querySelector("input") as HTMLInputElement;
    expect(editor.view.dom.querySelector("li")?.getAttribute("data-status")).toBe("doing");
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    expect(items(editor)).toEqual([{ checked: true, status: null, text: "doing" }]);
    expect(editor.getMarkdown()).toContain("- [x] doing");
    editor.destroy();
  });
});
