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

/** Type `text` the way the keyboard does, so input rules run. */
function type(editor: InstanceType<typeof Editor>, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, char));
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
  }
}

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
    const [item] = items(editor);
    expect({ checked: item.checked, status: item.status }).toEqual({ checked: true, status: null });
    expect(item.text).toMatch(/^doing ✓\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(editor.getMarkdown()).toMatch(/- \[x\] doing ✓/);
    editor.destroy();
  });

  test("typing [/] or [-] and a space at a line start makes that kind of task", () => {
    for (const [marks, status] of [["[/] ", "doing"], ["[-] ", "canceled"]] as const) {
      const editor = make("<p></p>");
      editor.commands.focus();
      type(editor, marks);
      type(editor, "ship it");
      expect(items(editor)).toEqual([{ checked: false, status, text: "ship it" }]);
      expect(editor.getMarkdown()).toContain(`- [${marks[1]}] ship it`);
      editor.destroy();
    }
  });

  test("on a line that is already a task the box just changes", () => {
    const editor = make("- [ ] first\n");
    editor.commands.focus("end");
    editor.commands.splitListItem("taskItem");
    type(editor, "[/] ");
    type(editor, "second");
    expect(items(editor).map((i) => i.status)).toEqual([null, "doing"]);
    expect(editor.getJSON().content?.filter((n) => n.type === "taskList")).toHaveLength(1);
    editor.destroy();
  });

  test("[/] in a code block stays text", () => {
    const editor = make("```\n\n```\n");
    editor.commands.setTextSelection(1);
    expect(editor.isActive("codeBlock")).toBe(true);
    type(editor, "[/] ");
    expect(items(editor)).toEqual([]);
    editor.destroy();
  });
});

describe("task times", () => {
  test("ticking a task stamps when it was done; un-ticking removes it", () => {
    const editor = make("- [ ] ship it ◷2026-10-26T09:05\n");
    const input = () => editor.view.dom.querySelector("input") as HTMLInputElement;
    const line = () => editor.state.doc.firstChild?.firstChild?.firstChild?.textContent ?? "";

    input().checked = true;
    input().dispatchEvent(new Event("change"));
    expect(line()).toMatch(/^ship it ◷2026-10-26T09:05 ✓\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(editor.getMarkdown()).toMatch(/- \[x\] ship it ◷2026-10-26T09:05 ✓\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);

    input().checked = false;
    input().dispatchEvent(new Event("change"));
    expect(line()).toBe("ship it ◷2026-10-26T09:05");
    editor.destroy();
  });

  test("an older day-only stamp is replaced, and an empty task gets no stray space", () => {
    const editor = make("- [x] old ✓2026-09-01\n");
    const input = editor.view.dom.querySelector("input") as HTMLInputElement;
    input.checked = false;
    input.dispatchEvent(new Event("change"));
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.textContent).toBe("old");
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    const text = editor.state.doc.firstChild?.firstChild?.firstChild?.textContent ?? "";
    expect(text).toMatch(/^old ✓\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(text).not.toContain("2026-09-01");
    editor.destroy();
  });

  test("the times in a task line are styled as quiet bookkeeping", () => {
    const editor = make("- [ ] a ◷2026-10-26T09:05 b\n\nplain ◷2026-10-26T09:05\n");
    const spans = [...editor.view.dom.querySelectorAll(".task-stamp")].map((el) => el.textContent);
    expect(spans).toEqual(["◷2026-10-26T09:05"]);
    editor.destroy();
  });
});
