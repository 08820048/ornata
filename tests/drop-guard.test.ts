import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

let installDropGuard: typeof import("../src/lib/dropGuard").installDropGuard;
beforeAll(async () => {
  GlobalRegistrator.register();
  ({ installDropGuard } = await import("../src/lib/dropGuard"));
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

/** A drag event whose payload has the given types (happy-dom has no DataTransfer). */
function drag(type: "dragover" | "drop", types: string[]) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { types } });
  return event;
}

describe("main window drag and drop", () => {
  test("the webview receives drags itself, so blocks can be dragged in the editor", () => {
    const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
    const main = config.app.windows[0];
    // With Tauri's own handler on (the default) it swallows the drop of an in-page drag.
    expect(main.dragDropEnabled).toBe(false);
  });

  test("a dropped file can't navigate the webview away, but block drags are left alone", () => {
    const uninstall = installDropGuard(window);
    for (const type of ["dragover", "drop"] as const) {
      const file = drag(type, ["Files"]);
      window.dispatchEvent(file);
      expect(file.defaultPrevented).toBe(true);

      const block = drag(type, ["text/html"]);
      window.dispatchEvent(block);
      expect(block.defaultPrevented).toBe(false);
    }
    uninstall();
    const after = drag("drop", ["Files"]);
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
