import { create } from "zustand";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import {
  externalNote,
  noteRefForPath,
  sameNote,
  vaultNote,
} from "@/lib/noteRef";
import type {
  ExternalNote,
  NoteRef,
  Theme,
  TreeNode,
  VaultSnapshot,
  View,
} from "@/lib/types";
import { parentDir } from "@/lib/utils";
import { useTabs } from "@/stores/tabs";
import { t } from "@/stores/locale";

type Status = "loading" | "welcome" | "ready";

interface VaultState {
  status: Status;
  root: string;
  name: string;
  tree: TreeNode[];
  theme: Theme;
  view: View | null;
  expanded: Set<string>;
  /** note rels most recently opened, newest first (session MRU) */
  recentNotes: string[];

  startup: () => Promise<void>;
  chooseVault: () => Promise<void>;
  createVault: () => Promise<void>;
  chooseExternalNotes: () => Promise<void>;
  openExternalNotes: (notes: ExternalNote[]) => void;
  refreshTree: () => Promise<void>;
  setView: (view: View | null) => void;
  pushRecent: (rel: string) => void;
  toggleExpanded: (rel: string) => void;
  expandTo: (rel: string) => void;

  createNote: (dir: string) => Promise<void>;
  createFolder: (dir: string, name: string) => Promise<string | null>;
  renameEntry: (rel: string, name: string) => Promise<void>;
  renameExternalNote: (path: string, name: string) => Promise<void>;
  moveEntry: (rel: string, dir: string) => Promise<void>;
  deleteEntry: (rel: string) => Promise<void>;
  deleteExternalNote: (path: string) => Promise<void>;

  setTheme: (theme: Theme) => Promise<void>;
  cycleTheme: () => Promise<void>;
}

function applyTheme(theme: Theme) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const dark = theme === "dark" || (theme === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
}

let systemThemeListener: (() => void) | null = null;

function watchSystemTheme(get: () => VaultState) {
  if (systemThemeListener) return;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  systemThemeListener = () => applyTheme(get().theme);
  media.addEventListener("change", systemThemeListener);
}

const oops = (err: unknown) =>
  toast.error(err instanceof Error ? err.message : String(err));

/** Apply a freshly opened/created vault snapshot as the active vault. */
function openVaultSnapshot(
  set: (partial: Partial<VaultState>) => void,
  snapshot: VaultSnapshot | null,
) {
  if (!snapshot) return;
  applyTheme(snapshot.theme);
  set({
    status: "ready",
    root: snapshot.root,
    name: snapshot.name,
    tree: snapshot.tree,
    theme: snapshot.theme,
    view: null,
    expanded: new Set<string>(),
    recentNotes: seedRecents(snapshot.tree),
  });
  useTabs.getState().clear();
}

/** Top note rels by on-disk mtime — seeds "recent" before any note is opened. */
function seedRecents(tree: TreeNode[]): string[] {
  const notes: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "note") notes.push(node);
      if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return notes
    .sort((a, b) => b.modifiedMs - a.modifiedMs)
    .slice(0, 8)
    .map((n) => n.rel);
}

/** Rewrite recent-note rels after a rename/move of `rel` → `next` (folder or note). */
function remapRecents(
  set: (partial: Partial<VaultState>) => void,
  get: () => VaultState,
  rel: string,
  next: string,
) {
  set({
    recentNotes: get().recentNotes.map((r) =>
      r === rel ? next : r.startsWith(`${rel}/`) ? next + r.slice(rel.length) : r,
    ),
  });
}

export const useVault = create<VaultState>((set, get) => ({
  status: "loading",
  root: "",
  name: "",
  tree: [],
  theme: "system",
  view: null,
  expanded: new Set<string>(),
  recentNotes: [],

  startup: async () => {
    watchSystemTheme(get);
    try {
      const snapshot = await ipc.startup();
      if (!snapshot) {
        applyTheme("system");
        set({ status: "welcome" });
        return;
      }
      applyTheme(snapshot.theme);
      set({
        status: "ready",
        root: snapshot.root,
        name: snapshot.name,
        tree: snapshot.tree,
        theme: snapshot.theme,
        recentNotes: seedRecents(snapshot.tree),
      });
    } catch (err) {
      oops(err);
      set({ status: "welcome" });
    }
  },

  chooseVault: async () => {
    try {
      openVaultSnapshot(set, await ipc.chooseVault());
    } catch (err) {
      oops(err);
    }
  },

  createVault: async () => {
    try {
      openVaultSnapshot(set, await ipc.createVault());
    } catch (err) {
      oops(err);
    }
  },

  chooseExternalNotes: async () => {
    try {
      get().openExternalNotes(await ipc.chooseExternalNotes());
    } catch (err) {
      oops(err);
    }
  },

  openExternalNotes: (notes) => {
    if (get().status !== "ready") return;
    for (const external of notes) {
      const note = noteRefForPath(get().root, external.path);
      if (note.kind === "vault") get().expandTo(note.rel);
      get().setView({ type: "note", note });
    }
  },

  refreshTree: async () => {
    if (get().status !== "ready") return;
    try {
      set({ tree: await ipc.loadTree() });
    } catch {
      // transient (e.g. vault briefly unavailable) — next refresh wins
    }
  },

  setView: (view) => {
    set({ view });
    if (view?.type === "note") {
      useTabs.getState().open(view.note);
      if (view.note.kind === "vault") get().pushRecent(view.note.rel);
    }
  },

  pushRecent: (rel) => {
    const recentNotes = [
      rel,
      ...get().recentNotes.filter((r) => r !== rel),
    ].slice(0, 8);
    set({ recentNotes });
  },

  toggleExpanded: (rel) => {
    const expanded = new Set(get().expanded);
    if (expanded.has(rel)) {
      expanded.delete(rel);
    } else {
      expanded.add(rel);
    }
    set({ expanded });
  },

  expandTo: (rel) => {
    const expanded = new Set(get().expanded);
    const parts = rel.split("/");
    let path = "";
    for (const part of parts.slice(0, -1)) {
      path = path ? `${path}/${part}` : part;
      expanded.add(path);
    }
    set({ expanded });
  },

  createNote: async (dir) => {
    try {
      const rel = await ipc.createNote(dir, t("common.untitled"));
      await get().refreshTree();
      get().expandTo(rel);
      // Route through setView so the tab opens (blank pane otherwise).
      const note = vaultNote(rel);
      get().setView({ type: "note", note });
      useTabs.getState().requestTitleFocus(note);
    } catch (err) {
      oops(err);
    }
  },

  createFolder: async (dir, name) => {
    try {
      const rel = await ipc.createFolder(dir, name);
      await get().refreshTree();
      get().expandTo(`${rel}/x`);
      return rel;
    } catch (err) {
      oops(err);
      return null;
    }
  },

  renameEntry: async (rel, name) => {
    try {
      const next = await ipc.renameEntry(rel, name);
      const { view } = get();
      await get().refreshTree();
      remapRecents(set, get, rel, next);
      useTabs.getState().remap(rel, next);
      if (view?.type === "note" && view.note.kind === "vault") {
        if (view.note.rel === rel) {
          set({ view: { type: "note", note: vaultNote(next) } });
        } else if (view.note.rel.startsWith(`${rel}/`)) {
          set({
            view: {
              type: "note",
              note: vaultNote(view.note.rel.replace(rel, next)),
            },
          });
        }
      }
    } catch (err) {
      oops(err);
    }
  },

  renameExternalNote: async (path, name) => {
    try {
      const current = externalNote(path);
      const renamed = await ipc.renameExternalNote(path, name);
      const next = externalNote(renamed.path);
      useTabs.getState().replace(current, next);
      const { view } = get();
      if (view?.type === "note" && sameNote(view.note, current)) {
        set({ view: { type: "note", note: next } });
      }
    } catch (err) {
      oops(err);
    }
  },

  moveEntry: async (rel, dir) => {
    try {
      const next = await ipc.moveEntry(rel, dir);
      const { view } = get();
      await get().refreshTree();
      get().expandTo(next);
      remapRecents(set, get, rel, next);
      useTabs.getState().remap(rel, next);
      if (view?.type === "note" && view.note.kind === "vault") {
        if (view.note.rel === rel) {
          set({ view: { type: "note", note: vaultNote(next) } });
        } else if (view.note.rel.startsWith(`${rel}/`)) {
          set({
            view: {
              type: "note",
              note: vaultNote(view.note.rel.replace(rel, next)),
            },
          });
        }
      }
    } catch (err) {
      oops(err);
    }
  },

  deleteEntry: async (rel) => {
    try {
      await ipc.deleteEntry(rel);
      const { view } = get();
      await get().refreshTree();
      const gone = (r: string) => r === rel || r.startsWith(`${rel}/`);
      const goneTab = (note: NoteRef) =>
        note.kind === "vault" && gone(note.rel);
      set({ recentNotes: get().recentNotes.filter((r) => !gone(r)) });

      // Drop affected tabs; if the active note went with them, activate the
      // nearest surviving tab to its right (else the last one standing).
      const before = useTabs.getState().tabs;
      useTabs.getState().removeUnder(rel);
      if (
        view?.type === "note" &&
        view.note.kind === "vault" &&
        gone(view.note.rel)
      ) {
        const index = before.findIndex((tab) => sameNote(tab, view.note));
        const right = before.slice(index + 1).find((tab) => !goneTab(tab));
        const survivors = before.filter((tab) => !goneTab(tab));
        const next = right ?? survivors[survivors.length - 1] ?? null;
        get().setView(next ? { type: "note", note: next } : null);
      }
      toast(t("toast.movedToTrash"), {
        description: rel.split("/").pop()?.replace(/\.md$/, ""),
      });
    } catch (err) {
      oops(err);
    }
  },

  deleteExternalNote: async (path) => {
    try {
      const note = externalNote(path);
      await ipc.deleteExternalNote(path);
      const { tabs, close } = useTabs.getState();
      const index = tabs.findIndex((tab) => sameNote(tab, note));
      const next = tabs[index + 1] ?? tabs[index - 1] ?? null;
      close(note);
      const { view } = get();
      if (view?.type === "note" && sameNote(view.note, note)) {
        get().setView(next ? { type: "note", note: next } : null);
      }
      toast(t("toast.movedToTrash"), {
        description: path.split(/[\\/]/).pop(),
      });
    } catch (err) {
      oops(err);
    }
  },

  setTheme: async (theme) => {
    applyTheme(theme);
    set({ theme });
    try {
      await ipc.setTheme(theme);
    } catch (err) {
      oops(err);
    }
  },

  cycleTheme: async () => {
    // Keyboard toggle only flips light ↔ dark; never sets "system".
    const isDark = document.documentElement.classList.contains("dark");
    await get().setTheme(isDark ? "light" : "dark");
  },
}));

/** Folder rel of the current selection — used as target for "new note". */
export function activeDir(state: Pick<VaultState, "view">) {
  return state.view?.type === "note" && state.view.note.kind === "vault"
    ? parentDir(state.view.note.rel)
    : "";
}
