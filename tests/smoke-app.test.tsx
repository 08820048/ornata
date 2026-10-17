import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Mounts the real AppShell in a DOM and drives the layout states that have
 * crashed at startup before (render loops, orphaned panes). It catches the
 * class of bug that type checks and unit tests cannot: a component that
 * throws or re-renders forever the moment it appears.
 */

const NOTES = ["a.md", "b.md", "c.md", "d.md", "e.md"];

/** What the mocked `read_note` command returns. */
const note = { body: "# Hello\n\nbody text" };

/** What the mocked `mcp_status` command returns. */
const mcp: { status: unknown } = { status: null };

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    if (command === "read_note") return note.body;
    if (command === "mcp_status") return mcp.status;
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

  test("the MCP plug is green while an agent is connected and opens its settings", async () => {
    mcp.status = {
      vaultPath: "/vault",
      access: "readWrite",
      sessions: [{ pid: 1, vault: "/vault", client: "claude-code", startedMs: 1 }],
      executable: "/Applications/Ornata.app/Contents/MacOS/Ornata",
      installedAt: null,
      server: { running: false, port: 13200, activity: null },
    };
    const { act, useUi } = await mountShell();
    const plug = () => container.querySelector<HTMLElement>("footer[aria-label] button");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(plug()?.className).toContain("text-success");
    expect(plug()?.getAttribute("aria-label")).toContain("claude-code");

    // The dialog is mounted by App, beside AppShell.
    const { McpDialog } = await import("../src/components/mcp/McpDialog");
    const { createElement } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const dialogHost = document.createElement("div");
    document.body.appendChild(dialogHost);
    const dialogRoot = createRoot(dialogHost);
    await act(async () => {
      dialogRoot.render(createElement(McpDialog));
    });
    await act(async () => {
      useUi.getState().setMcpOpen(true);
    });
    const panel = document.body.textContent ?? "";
    expect(panel).toContain("claude mcp add ornata --transport http http://127.0.0.1:13200/mcp");
    expect(panel).toContain("Connected · claude-code (stdio)");

    // switching the server on turns the banner into "active on port"
    mcp.status = {
      ...(mcp.status as object),
      sessions: [],
      server: { running: true, port: 13200, activity: { lastClient: "claude-code", lastSeenMs: 1, sessions: 1 } },
    };
    const { useMcp: store } = await import("../src/stores/mcp");
    await act(async () => {
      await store.getState().refresh();
    });
    expect(document.body.textContent).toContain("MCP server active on port 13200 · last used by claude-code");
    expect(document.body.textContent).toContain("Disconnect");

    // access off: gray, even though the process is still there
    mcp.status = { ...(mcp.status as object), access: "off", sessions: [] };
    const { useMcp } = await import("../src/stores/mcp");
    await act(async () => {
      await useMcp.getState().refresh();
    });
    expect(plug()?.className).not.toContain("text-success");
    // No unmount here: tearing down a modal mid-animation makes happy-dom's
    // Web Animations shim reject unhandled (a test-environment artefact).
  });

  test("code blocks fold by indentation and collapse as a whole", async () => {
    note.body = "# Code\n\n```rust\nfn a() {\n    one();\n    two();\n}\n```\n";
    const { act, useVault, vaultNote } = await mountShell();
    await act(async () => {
      useVault.getState().setView({ type: "note", note: vaultNote("code.md") });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    const wrap = () => document.querySelector<HTMLElement>(".code-block-wrap");
    expect(wrap()).not.toBeNull();
    expect(document.querySelector(".code-fold")).not.toBeNull();
    expect(document.querySelector(".code-hidden")).toBeNull();

    // the gutter arrow folds the function body and leaves a marker behind
    await act(async () => {
      document.querySelector(".code-fold")!.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    const hiddenText = [...document.querySelectorAll(".code-hidden")].map((el) => el.textContent).join("");
    expect(hiddenText).toContain("one();");
    expect(hiddenText).toContain("two();");
    expect(hiddenText).not.toContain("fn a()");
    expect(document.querySelector(".code-fold-ellipsis")?.textContent).toContain("2");
    expect(document.querySelector(".code-fold")?.getAttribute("data-folded")).toBe("true");

    // unfold, then collapse the whole block from the toolbar
    await act(async () => {
      document.querySelector(".code-fold")!.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    expect(document.querySelector(".code-hidden")).toBeNull();
    const toggle = document.querySelector<HTMLElement>(".code-block-toggle")!;
    await act(async () => {
      toggle.click();
    });
    expect(document.querySelector(".code-collapsed")).not.toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      toggle.click();
    });
    expect(document.querySelector(".code-collapsed")).toBeNull();
    note.body = "# Hello\n\nbody text";
  });

  test("the + on an empty line types a slash to open the suggestion menu", async () => {
    note.body = "```js\nx\n```\n";
    const { act, useVault, vaultNote } = await mountShell();
    await act(async () => {
      useVault.getState().setView({ type: "note", note: vaultNote("plus.md") });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    const plus = document.querySelector(".block-plus");
    expect(plus).not.toBeNull();
    // the drag grip is mounted too (shown on hover by the extension)
    expect(document.querySelector(".block-handle")).not.toBeNull();

    const editorEl = plus!.closest(".ProseMirror")!;
    await act(async () => {
      plus!.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    // clicking the plus types a "/" on that line, which is what opens the menu
    expect(editorEl.textContent).toContain("/");
    note.body = "# Hello\n\nbody text";
  });
});
