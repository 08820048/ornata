import { expect, test, describe, beforeEach } from "bun:test";
import { Window } from "happy-dom";

// ── headless DOM ────────────────────────────────────────────────────────────
const win = new Window();
for (const key of [
  "window",
  "document",
  "FileReader",
  "File",
  "Blob",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "navigator",
  "customElements",
  "HTMLElement",
  "HTMLSpanElement",
  "Element",
  "Node",
  "Text",
  "DocumentFragment",
  "ShadowRoot",
  "Range",
  "Selection",
  "ClipboardEvent",
  "DragEvent",
  "KeyboardEvent",
  "InputEvent",
  "Event",
]) {
  // @ts-expect-error test harness
  globalThis[key] = win[key] ?? globalThis[key];
}
// @ts-expect-error test harness
globalThis.window = win;
// @ts-expect-error test harness
win.__TAURI_INTERNALS__ = {
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  invoke: () => Promise.resolve(null),
  transformCallback: (cb: unknown) => cb,
};

const store = new Map<string, string>();
// @ts-expect-error test harness
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { Editor } = await import("@tiptap/core");
const { createExtensions } = await import("../src/components/editor/extensions");
const { insertImageFile } = await import("../src/components/editor/insertImage");
const { ipc } = await import("../src/lib/ipc");
const { useVault } = await import("../src/stores/vault");

function makeEditor() {
  return new Editor({
    extensions: createExtensions("/vault") as never,
    element: win.document.createElement("div"),
  });
}

function fakeImageFile(): File {
  // 1×1 transparent PNG, same bytes the settings "verify" button uses.
  const bytes = Uint8Array.from(atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  ), (c) => c.charCodeAt(0));
  return new win.File([bytes], "shot.png", { type: "image/png" });
}

const savedLocally = { called: 0 };
const uploads = { called: 0 };
// @ts-expect-error test mock
ipc.saveImageAsset = async () => {
  savedLocally.called++;
  return "/vault/.ornata/assets/pasted-1.png";
};
// @ts-expect-error test mock
ipc.uploadImage = async () => {
  uploads.called++;
  await new Promise((r) => setTimeout(r, 20));
  return "https://cdn.example.com/pasted-1.png";
};

describe("insertImageFile (headless, real editor)", () => {
  beforeEach(() => {
    savedLocally.called = 0;
    uploads.called = 0;
  });

  test("custom mode: local insert immediately, background swap to URL", async () => {
    useVault.setState({ imageUpload: { mode: "custom", command: "picgo upload" } });
    const editor = makeEditor();
    editor.commands.setContent("<p>hello</p>");
    editor.commands.setTextSelection(3);

    await insertImageFile({
      editor,
      file: fakeImageFile(),
      range: { from: 3, to: 3 },
      vaultRoot: "/vault",
      note: { kind: "vault", rel: "notes/a.md" } as never,
    });

    // Local image landed right away.
    const afterPaste = editor.getMarkdown();
    expect(afterPaste).toContain(".ornata/assets/pasted-1.png");
    expect(savedLocally.called).toBe(1);

    // Background upload replaced the src with the hosted URL.
    await new Promise((r) => setTimeout(r, 50));
    expect(uploads.called).toBe(1);
    const afterUpload = editor.getMarkdown();
    expect(afterUpload).toContain("https://cdn.example.com/pasted-1.png");
    expect(afterUpload).not.toContain(".ornata/assets/pasted-1.png");
    editor.destroy();
  });

  test("local mode: no upload, straight local insert", async () => {
    useVault.setState({ imageUpload: { mode: "local", command: "" } });
    const editor = makeEditor();
    editor.commands.setContent("<p>hello</p>");
    editor.commands.setTextSelection(3);

    await insertImageFile({
      editor,
      file: fakeImageFile(),
      range: { from: 3, to: 3 },
      vaultRoot: "/vault",
      note: { kind: "vault", rel: "notes/a.md" } as never,
    });

    expect(editor.getMarkdown()).toContain(".ornata/assets/pasted-1.png");
    expect(uploads.called).toBe(0);
    editor.destroy();
  });
});
