import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

mock.module("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => p, invoke: async () => null }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => undefined, emit: async () => undefined }));
mock.module("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));

let useVault: typeof import("../src/stores/vault").useVault;
let vaultNote: typeof import("../src/lib/noteRef").vaultNote;

beforeAll(async () => {
  GlobalRegistrator.register();
  ({ useVault } = await import("../src/stores/vault"));
  ({ vaultNote } = await import("../src/lib/noteRef"));
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

test("showing a note opens its folders in the tree, whichever way it was reached", () => {
  useVault.setState({ expanded: new Set() });
  useVault.getState().setView({ type: "note", note: vaultNote("a/b/c.md") });
  expect([...useVault.getState().expanded].sort()).toEqual(["a", "a/b"]);

  // Switching to a note elsewhere keeps what was open and adds the new path.
  useVault.getState().setView({ type: "note", note: vaultNote("x/y.md") });
  expect([...useVault.getState().expanded].sort()).toEqual(["a", "a/b", "x"]);

  // A note at the root, or the same note again, changes nothing.
  const before = useVault.getState().expanded;
  useVault.getState().setView({ type: "note", note: vaultNote("root.md") });
  useVault.getState().setView({ type: "note", note: vaultNote("x/y.md") });
  expect(useVault.getState().expanded).toBe(before);
});
