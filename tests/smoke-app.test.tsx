import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Mounts the real AppShell in a DOM and drives the layout states that have
 * crashed at startup before (render loops, orphaned panes). It catches the
 * class of bug that type checks and unit tests cannot: a component that
 * throws or re-renders forever the moment it appears.
 */

const NOTES = ["a.md", "b.md", "c.md", "d.md", "e.md"];

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    if (command === "read_note") return "# Hello\n\nbody text";
    if (/(backlinks|mentions|history|templates|search|list_|tasks)/.test(command)) return [];
    if (command === "link_graph") return { nodes: [], edges: [] };
    return null;
  },
  convertFileSrc: (path: string) => path,
}));
mock.module("@tauri-apps/api/event", () => ({
  listen: async () => () => undefined,
  emit: async () => undefined,
}));
mock.module("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main", onResized: async () => () => undefined }),
}));
mock.module("@tauri-apps/plugin-opener", () => ({
  openUrl: async () => undefined,
  openPath: async () => undefined,
  revealItemInDir: async () => undefined,
}));
mock.module("@tauri-apps/plugin-process", () => ({ relaunch: async () => undefined }));
mock.module("@tauri-apps/plugin-updater", () => ({ check: async () => null }));

let root: import("react-dom/client").Root;
let container: HTMLElement;
const errors: unknown[] = [];

beforeAll(() => {
  GlobalRegistrator.register({ width: 1400, height: 900 });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia ??= (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  window.addEventListener("error", (event) => errors.push(event.error));
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

async function mountShell() {
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { AppShell } = await import("../src/components/layout/AppShell");
  const { useVault } = await import("../src/stores/vault");
  const { useTabs } = await import("../src/stores/tabs");
  const { useUi } = await import("../src/stores/ui");
  const { vaultNote } = await import("../src/lib/noteRef");

  useVault.setState({
    status: "ready",
    root: "/vault",
    name: "vault",
    tree: NOTES.map((rel) => ({ name: rel.replace(".md", ""), rel, kind: "note" as const, modifiedMs: 0 })),
  });
  container = document.createElement("div");
  container.style.height = "900px";
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AppShell));
  });
  return { act, useVault, useTabs, useUi, vaultNote };
}

describe("AppShell smoke", () => {
  test("mounts and survives every split layout transition without render loops", async () => {
    const { act, useVault, useTabs, useUi, vaultNote } = await mountShell();
    const [a, b, c, d] = NOTES.map(vaultNote);
    const open = (note: ReturnType<typeof vaultNote>) =>
      act(async () => {
        useVault.getState().setView({ type: "note", note });
      });

    // empty workspace → single note
    expect(container.textContent).toBeTruthy();
    await open(a);
    expect(document.querySelectorAll("[data-pane]").length).toBe(1);

    // open aside twice → three panes, each with its own header
    await act(async () => {
      useTabs.getState().openAside(a, b);
    });
    await act(async () => {
      useTabs.getState().openAside(b, c);
    });
    expect(useTabs.getState().split?.panes).toHaveLength(3);
    expect(container.querySelectorAll('[role="separator"]').length).toBe(2);

    // focus another pane, then close the focused one: focus must land on a pane
    await open(b);
    const { closePaneAndRefocus } = await import("../src/lib/closePane");
    await act(async () => {
      closePaneAndRefocus(b);
    });
    const view = useVault.getState().view;
    const panes = useTabs.getState().split?.panes ?? [];
    expect(view?.type === "note" && panes.some((p) => p.kind === "vault" && p.rel === view.note.rel)).toBe(true);

    // closing down to one pane returns to the single layout
    await act(async () => {
      closePaneAndRefocus(c);
    });
    expect(useTabs.getState().split).toBeNull();
    expect(container.querySelectorAll('[role="separator"]').length).toBe(0);

    // focus mode toggles cleanly with and without a split
    await act(async () => {
      useUi.getState().toggleFocusMode();
    });
    await act(async () => {
      useTabs.getState().openAside(a, d);
    });
    await act(async () => {
      useUi.getState().toggleFocusMode();
    });
    expect(useUi.getState().focusMode).toBe(false);

    await act(async () => {
      root.unmount();
    });
    expect(errors.filter(Boolean)).toEqual([]);
  });
});
