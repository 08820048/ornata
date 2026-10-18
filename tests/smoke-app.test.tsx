import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// `act` only exists in React's development build, and it is imported below
// after this runs — a globally exported NODE_ENV=production would otherwise
// fail every test here with "act is not a function".
process.env.NODE_ENV = "development";

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
    if (command === "load_tree") {
      return NOTES.map((rel) => ({ name: rel.replace(".md", ""), rel, kind: "note", modifiedMs: 0 }));
    }
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
  // happy-dom's Web Animations shim rejects `Animation.finished` whenever motion
  // restarts an animation. Without `animate`, motion drives animations itself.
  delete (window.Element.prototype as { animate?: unknown }).animate;
  delete (window.HTMLElement.prototype as { animate?: unknown }).animate;
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
      server: { running: false, port: 13200, activity: null, token: "tok" },
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
      server: { running: true, port: 13200, activity: { lastClient: "claude-code", lastSeenMs: 1, sessions: 1 }, token: "tok" },
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

    // type above the block: the arrow's DOM is reused, and a click must still
    // fold the right lines (it reads its position when clicked)
    const codeEditor = (document.querySelector(".code-fold")!.closest(".ProseMirror") as unknown as {
      editor: import("@tiptap/core").Editor;
    }).editor;
    const arrowBefore = document.querySelector(".code-fold");
    await act(async () => {
      codeEditor.commands.insertContentAt(2, "longer title ");
    });
    expect(document.querySelector(".code-fold")).toBe(arrowBefore);
    await act(async () => {
      document.querySelector(".code-fold")!.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    const hiddenAfter = [...document.querySelectorAll(".code-hidden")].map((el) => el.textContent).join("");
    expect(hiddenAfter).toContain("one();");
    expect(hiddenAfter).not.toContain("fn a()");
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

    const editorEl = plus!.closest(".ProseMirror")!;
    await act(async () => {
      plus!.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    // clicking the plus types a "/" on that line, which is what opens the menu
    expect(editorEl.textContent).toContain("/");
    note.body = "# Hello\n\nbody text";
  });

  test("each pane keeps its own back/forward history", async () => {
    const { act, useVault, useTabs, vaultNote } = await mountShell();
    // the stores are shared across tests: start from nothing open
    await act(async () => {
      // (clear() would unmount every pane mid-animation, which happy-dom reports as an unhandled abort)
      useTabs.setState({ split: null, solo: { entries: [], index: -1 } });
      useVault.setState({ view: null });
    });
    const { goBack, goForward } = await import("../src/lib/navigate");
    const { tabOfView } = await import("../src/lib/noteRef");
    const [a, b, c, d] = NOTES.map(vaultNote);
    const show = (n: ReturnType<typeof vaultNote>) =>
      act(async () => {
        useVault.getState().setView({ type: "note", note: n });
      });
    const shown = () => useTabs.getState().split?.panes.map((p) => (p.kind === "vault" ? p.rel : "?"));
    const focused = () => {
      const view = useVault.getState().view;
      return view?.type === "note" && view.note.kind === "vault" ? view.note.rel : null;
    };

    // one pane: a → b, back returns to a
    await show(a);
    await show(b);
    await act(async () => goBack());
    expect(focused()).toBe("a.md");
    await act(async () => goForward());
    expect(focused()).toBe("b.md");

    // split b | c, then walk the right pane c → d
    await act(async () => {
      useTabs.getState().openAside(tabOfView(useVault.getState().view!), c);
    });
    expect(shown()).toEqual(["b.md", "c.md"]);
    await show(c); // click the right pane: only a refocus
    await show(d); // open d in it
    expect(shown()).toEqual(["b.md", "d.md"]);

    // back in the right pane returns to c — the left pane still shows b
    await act(async () => goBack());
    expect(shown()).toEqual(["b.md", "c.md"]);
    expect(focused()).toBe("c.md");

    // focusing the left pane and going back uses *its* trail (a), not the right pane's
    await show(b);
    expect(shown()).toEqual(["b.md", "c.md"]); // refocus changed nothing
    await act(async () => goBack());
    expect(shown()).toEqual(["a.md", "c.md"]);
    await act(async () => goForward());
    expect(shown()).toEqual(["b.md", "c.md"]);

    // close the left pane: the right one keeps its own trail as the single history
    await act(async () => {
      const { closePaneAndRefocus } = await import("../src/lib/closePane");
      closePaneAndRefocus(b);
    });
    expect(useTabs.getState().split).toBeNull();
    expect(focused()).toBe("c.md");
    await act(async () => goBack()); // c began its own trail here, so there's nothing earlier
    expect(focused()).toBe("c.md");
  });

  test("a restart restores the split, the focused pane, and each pane's history", async () => {
    const { act, useVault, useTabs, vaultNote } = await mountShell();
    const { restoreSession } = await import("../src/lib/session");
    const { goBack } = await import("../src/lib/navigate");
    const [a, b, c, d] = NOTES.map(vaultNote);
    const hist = (...tabs: unknown[]) => ({ entries: tabs, index: tabs.length - 1 });
    localStorage.setItem(
      "ornata:session:/vault",
      JSON.stringify({
        tabs: [a, b, c, d],
        view: { type: "note", note: d },
        panes: {
          split: { panes: [b, d], sizes: [0.3, 0.7], histories: [hist(a, b), hist(c, d)] },
          solo: { entries: [], index: -1 },
        },
      }),
    );
    await act(async () => {
      useTabs.setState({ split: null, solo: { entries: [], index: -1 } });
      useVault.setState({ view: null });
      await restoreSession("/vault");
    });
    const split = useTabs.getState().split!;
    expect(split.panes.map((p) => (p.kind === "vault" ? p.rel : "?"))).toEqual(["b.md", "d.md"]);
    expect(split.sizes).toEqual([0.3, 0.7]);
    const view = useVault.getState().view;
    expect(view?.type === "note" && view.note.kind === "vault" && view.note.rel).toBe("d.md");

    // back in the focused (right) pane uses its own trail: d → c; the left pane is untouched
    await act(async () => goBack());
    expect(useTabs.getState().split!.panes.map((p) => (p.kind === "vault" ? p.rel : "?"))).toEqual(["b.md", "c.md"]);
    expect(useTabs.getState().split!.histories[0].entries).toHaveLength(2);
    localStorage.removeItem("ornata:session:/vault");
  });

  test("an agent's change on disk shows up in the open note, but never over unsaved typing", async () => {
    note.body = "# Inbox\n\nfirst line";
    const { act, useVault, vaultNote } = await mountShell();
    await act(async () => {
      useVault.setState({ view: null });
      useVault.getState().setView({ type: "note", note: vaultNote("inbox-sync.md") });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    const pane = () => document.querySelector<HTMLElement>('[data-pane="vault:inbox-sync.md"] .ProseMirror')!;
    expect(pane().textContent).toContain("first line");

    // an agent appends over MCP; the vault watcher fires
    const { handleVaultChanged } = await import("../src/lib/vaultEvents");
    note.body = "# Inbox\n\nfirst line\n\nadded by an agent";
    await act(async () => {
      handleVaultChanged();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(pane().textContent).toContain("added by an agent");

    // with unsaved typing in the note, the disk version does not replace it
    const editor = (pane() as unknown as { editor: import("@tiptap/core").Editor }).editor;
    await act(async () => {
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, " typing");
    });
    note.body = "# Inbox\n\nsomething else entirely";
    await act(async () => {
      handleVaultChanged();
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(pane().textContent).toContain("typing");
    expect(pane().textContent).not.toContain("something else entirely");
    note.body = "# Hello\n\nbody text";
  });
});
