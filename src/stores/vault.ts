import { create } from "zustand";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import {
  externalNote,
  noteRefForPath,
  relIsUnder,
  remapRelList,
  sameNote,
  sameTab,
  tabOfView,
  vaultNote,
  viewOfTab,
  GRAPH_TAB,
} from "@/lib/noteRef";
import type {
  ExternalNote,
  TreeSort,
  ImageUpload,
  TabRef,
  DarkPalette,
  LightPalette,
  Theme,
  TreeNode,
  VaultSnapshot,
  View,
} from "@/lib/types";
import { flattenNotes } from "@/lib/tree";
import { parentDir } from "@/lib/utils";
import { applyPalettes, applyTheme } from "@/lib/theme";
import { broadcastSettings } from "@/lib/settingsSync";
import { dailyRel } from "@/lib/dateLinks";
import { useTabs } from "@/stores/tabs";
import { t } from "@/stores/locale";

type Status = "loading" | "welcome" | "ready";

interface VaultState {
  status: Status;
  root: string;
  name: string;
  tree: TreeNode[];
  theme: Theme;
  lightPalette: LightPalette;
  darkPalette: DarkPalette;
  outlineSound: boolean;
  cursorAnimation: boolean;
  imageUpload: ImageUpload;
  view: View | null;
  expanded: Set<string>;
  /** note rels most recently opened, newest first (session MRU) */
  recentNotes: string[];

  startup: () => Promise<void>;
  /** Load scalar settings into a fresh (settings-window) store, no side effects. */
  hydrateSettings: () => Promise<void>;
  applyRemoteTheme: (theme: Theme) => void;
  applyRemotePalettes: (light?: LightPalette, dark?: DarkPalette) => void;
  applyRemoteOutlineSound: (enabled: boolean) => void;
  applyRemoteCursorAnimation: (enabled: boolean) => void;
  applyRemoteImageUpload: (upload: ImageUpload) => void;
  adoptVaultSnapshot: (snapshot: VaultSnapshot) => void;
  chooseVault: () => Promise<void>;
  createVault: () => Promise<void>;
  chooseExternalNotes: () => Promise<void>;
  openExternalNotes: (notes: ExternalNote[]) => void;
  refreshTree: () => Promise<void>;
  /** `record: false` shows the view without adding it to back/forward history. */
  setView: (view: View | null, options?: { record?: boolean }) => void;
  pushRecent: (rel: string) => void;
  toggleExpanded: (rel: string) => void;
  expandTo: (rel: string) => void;

  createNote: (dir: string) => Promise<void>;
  /** Create a note at an exact rel (folders as needed). Returns the created
   *  rel, or null when a collision redirected the path. */
  createNoteAtRel: (rel: string) => Promise<string | null>;
  /** File tree ordering (per-vault, persisted in the UI session). */
  treeSort: TreeSort;
  setTreeSort: (sort: TreeSort) => void;
  /** Rels pinned in .ornata/pinned.json (vault-scoped, cross-machine). */
  pinned: string[];
  loadPinned: () => Promise<void>;
  togglePin: (rel: string) => Promise<void>;
  /** Open (creating from the daily template if needed) the note for `date`, default today. */
  openDailyNote: (date?: Date) => Promise<void>;
  /** Append a quick-capture line to Inbox.md (creating it if needed). */
  appendQuickCapture: (text: string) => Promise<void>;
  createNoteFromTemplate: (template: string) => Promise<void>;
  createFolder: (dir: string, name: string) => Promise<string | null>;
  renameEntry: (rel: string, name: string) => Promise<void>;
  renameExternalNote: (path: string, name: string) => Promise<void>;
  moveEntry: (rel: string, dir: string) => Promise<void>;
  deleteEntry: (rel: string) => Promise<void>;
  deleteExternalNote: (path: string) => Promise<void>;

  setTheme: (theme: Theme) => Promise<void>;
  setLightPalette: (palette: LightPalette) => Promise<void>;
  setDarkPalette: (palette: DarkPalette) => Promise<void>;
  setOutlineSound: (enabled: boolean) => Promise<void>;
  setCursorAnimation: (enabled: boolean) => Promise<void>;
  setImageUpload: (upload: ImageUpload) => Promise<void>;
  cycleTheme: () => Promise<void>;
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
  applyPalettes({ light: snapshot.lightPalette, dark: snapshot.darkPalette });
  set({
    status: "ready",
    root: snapshot.root,
    name: snapshot.name,
    tree: snapshot.tree,
    theme: snapshot.theme,
    lightPalette: snapshot.lightPalette,
    darkPalette: snapshot.darkPalette,
    outlineSound: snapshot.outlineSound,
    imageUpload: snapshot.imageUpload,
    cursorAnimation: snapshot.cursorAnimation,
    view: null,
    expanded: new Set<string>(),
    recentNotes: seedRecents(snapshot.tree),
    // Every vault starts at name order; the session restore re-applies this
    // vault's own saved preference right after.
    treeSort: "name",
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
  set({ recentNotes: remapRelList(get().recentNotes, rel, next) });
}

/** Same path rewrite for pins, persisted so a restart does not drop them. */
function remapPinned(
  set: (partial: Partial<VaultState>) => void,
  get: () => VaultState,
  rel: string,
  next: string,
) {
  const pinned = remapRelList(get().pinned, rel, next);
  const prev = get().pinned;
  if (pinned.length === prev.length && pinned.every((path, i) => path === prev[i])) return;
  set({ pinned });
  void ipc.writeAppData("pinned", JSON.stringify(pinned)).catch(oops);
}

function dropPinned(
  set: (partial: Partial<VaultState>) => void,
  get: () => VaultState,
  rel: string,
) {
  const prev = get().pinned;
  const pinned = prev.filter((path) => !relIsUnder(path, rel));
  if (pinned.length === prev.length) return;
  set({ pinned });
  void ipc.writeAppData("pinned", JSON.stringify(pinned)).catch(oops);
}

/** True when the tree contains a folder at exactly `rel`. */
function treeHasFolder(tree: TreeNode[], rel: string): boolean {
  for (const node of tree) {
    if (node.kind === "folder" && node.rel === rel) return true;
    if (node.children && treeHasFolder(node.children, rel)) return true;
  }
  return false;
}

/** Toast the number of notes whose links the backend rewrote on a move. */
function reportRewrites(outcome: { files: string[] }) {
  if (!outcome.files.length) return;
  toast(
    outcome.files.length === 1
      ? t("toast.linksRewritten.one", { count: 1 })
      : t("toast.linksRewritten.other", { count: outcome.files.length }),
  );
}

export const useVault = create<VaultState>((set, get) => ({
  status: "loading",
  treeSort: "name",
  pinned: [],
  root: "",
  name: "",
  tree: [],
  theme: "system",
  lightPalette: "default",
  darkPalette: "default",
  outlineSound: true,
  cursorAnimation: true,
  imageUpload: { mode: "local", command: "" },
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
      applyPalettes({ light: snapshot.lightPalette, dark: snapshot.darkPalette });
      set({
        status: "ready",
        root: snapshot.root,
        name: snapshot.name,
        tree: snapshot.tree,
        theme: snapshot.theme,
        lightPalette: snapshot.lightPalette,
    darkPalette: snapshot.darkPalette,
        outlineSound: snapshot.outlineSound,
        imageUpload: snapshot.imageUpload,
        cursorAnimation: snapshot.cursorAnimation,
        recentNotes: seedRecents(snapshot.tree),
      });
    } catch (err) {
      oops(err);
      set({ status: "welcome" });
    }
  },

  hydrateSettings: async () => {
    watchSystemTheme(get);
    try {
      const snapshot = await ipc.settingsSnapshot();
      applyTheme(snapshot.theme);
      applyPalettes({ light: snapshot.lightPalette, dark: snapshot.darkPalette });
      set({
        theme: snapshot.theme,
        lightPalette: snapshot.lightPalette,
    darkPalette: snapshot.darkPalette,
        outlineSound: snapshot.outlineSound,
        cursorAnimation: snapshot.cursorAnimation,
        imageUpload: snapshot.imageUpload,
        root: snapshot.vaultPath ?? "",
        name: snapshot.vaultName ?? "",
        status: snapshot.vaultPath ? "ready" : "welcome",
      });
    } catch {
      // Keep defaults; the settings window still renders with system values.
    }
  },

  applyRemoteTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  applyRemotePalettes: (light, dark) => {
    const next = {
      lightPalette: light ?? get().lightPalette,
      darkPalette: dark ?? get().darkPalette,
    };
    applyPalettes({ light: next.lightPalette, dark: next.darkPalette });
    set(next);
  },

  applyRemoteOutlineSound: (outlineSound) => {
    set({ outlineSound });
  },

  applyRemoteCursorAnimation: (cursorAnimation) => {
    set({ cursorAnimation });
  },

  applyRemoteImageUpload: (imageUpload) => {
    set({ imageUpload });
  },

  adoptVaultSnapshot: (snapshot) => {
    openVaultSnapshot(set, snapshot);
  },

  chooseVault: async () => {
    try {
      const snapshot = await ipc.chooseVault();
      openVaultSnapshot(set, snapshot);
      if (snapshot) broadcastSettings({ vault: snapshot });
    } catch (err) {
      oops(err);
    }
  },

  createVault: async () => {
    try {
      const snapshot = await ipc.createVault();
      openVaultSnapshot(set, snapshot);
      if (snapshot) broadcastSettings({ vault: snapshot });
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

  setView: (view, options) => {
    const previous = get().view;
    set({ view });
    // Moves focus between panes, and records the visit in the focused pane's
    // own history (not when stepping through that history, or just refocusing).
    useTabs.getState().followFocus(
      previous ? tabOfView(previous) : null,
      view ? tabOfView(view) : null,
      options?.record !== false,
    );
    if (view?.type === "note") {
      useTabs.getState().open(view.note);
      if (view.note.kind === "vault") get().pushRecent(view.note.rel);
    } else if (view?.type === "graph") {
      useTabs.getState().open(GRAPH_TAB);
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

  createNoteAtRel: async (rel) => {
    try {
      const name = (rel.split("/").pop() ?? rel).replace(/\.md$/i, "");
      // Create missing folders top-down; the backend suffixes colliding
      // creates, so verify each path matches what was asked for.
      let acc = "";
      for (const seg of parentDir(rel).split("/").filter(Boolean)) {
        const expected = acc ? `${acc}/${seg}` : seg;
        if (!treeHasFolder(get().tree, expected)) {
          const created = await ipc.createFolder(acc, seg);
          if (created !== expected) return null;
        }
        acc = expected;
      }
      const created = await ipc.createNote(acc, name);
      await get().refreshTree();
      return created;
    } catch (err) {
      oops(err);
      return null;
    }
  },

  setTreeSort: (sort) => set({ treeSort: sort }),

  loadPinned: async () => {
    try {
      const raw = await ipc.readAppData("pinned");
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return;
      const known = new Set(flattenNotes(get().tree).map((n) => n.rel));
      // Drop pins that no longer resolve (deleted, or moved while the app
      // was closed). Rename/move/delete update the file while it is open.
      const valid = parsed
        .filter((rel): rel is string => typeof rel === "string" && known.has(rel));
      set({ pinned: valid });
    } catch {
      set({ pinned: [] });
    }
  },

  togglePin: async (rel) => {
    const next = get().pinned.includes(rel)
      ? get().pinned.filter((r) => r !== rel)
      : [...get().pinned, rel];
    set({ pinned: next });
    try {
      await ipc.writeAppData("pinned", JSON.stringify(next));
    } catch (err) {
      oops(err);
    }
  },

  openDailyNote: async (date) => {
    try {
      const rel = dailyRel(date ?? new Date());
      const exists = flattenNotes(get().tree).some(
        (n) => n.rel.toLowerCase() === rel.toLowerCase(),
      );
      if (!exists) {
        // Optional daily template: .ornata/templates/daily.md
        let template = "";
        try {
          template = await ipc.readTemplate("daily");
        } catch {
          // No daily template — start empty.
        }
        const created = await get().createNoteAtRel(rel);
        if (!created) return;
        if (template) await ipc.writeNote(created, template);
      }
      const note = vaultNote(rel);
      get().expandTo(rel);
      get().setView({ type: "note", note });
    } catch (err) {
      oops(err);
    }
  },

  appendQuickCapture: async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const rel = "Inbox.md";
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const line = `- [${stamp}] ${trimmed.replace(/\s*\n+\s*/g, " ")}`;
    // Single writer: when Inbox is open in a pane, that pane appends to its
    // own content and saves through its normal pipeline.
    if (useTabs.getState().tabs.some((tab) => tab.kind === "vault" && tab.rel === rel)) {
      useTabs.getState().requestAppend(vaultNote(rel), line);
      return;
    }
    try {
      const current = await ipc.readNote(rel).catch(() => null);
      if (current === null) {
        const created = await get().createNoteAtRel(rel);
        if (!created) return;
        await ipc.writeNote(created, `${line}\n`);
      } else {
        const base = current.replace(/\n*$/, "");
        await ipc.writeNote(rel, base ? `${base}\n${line}\n` : `${line}\n`);
      }
      await get().refreshTree();
      toast(t("quick.captured"));
    } catch (err) {
      oops(err);
    }
  },

  createNoteFromTemplate: async (template) => {
    try {
      const content = await ipc.readTemplate(template);
      const dir = activeDir(get());
      const created = await ipc.createNote(dir, t("common.untitled"));
      if (content) await ipc.writeNote(created, content);
      await get().refreshTree();
      const note = vaultNote(created);
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
      const outcome = await ipc.renameEntry(rel, name);
      const next = outcome.next;
      const { view } = get();
      await get().refreshTree();
      remapRecents(set, get, rel, next);
      remapPinned(set, get, rel, next);
      useTabs.getState().remap(rel, next);
      useTabs.getState().applyLinkRewrites(outcome.rewrites);
      reportRewrites(outcome);
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
      const outcome = await ipc.moveEntry(rel, dir);
      const next = outcome.next;
      const { view } = get();
      await get().refreshTree();
      get().expandTo(next);
      remapRecents(set, get, rel, next);
      remapPinned(set, get, rel, next);
      useTabs.getState().remap(rel, next);
      useTabs.getState().applyLinkRewrites(outcome.rewrites);
      reportRewrites(outcome);
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
      const gone = (r: string) => relIsUnder(r, rel);
      const goneTab = (note: TabRef) =>
        note.kind === "vault" && gone(note.rel);
      set({ recentNotes: get().recentNotes.filter((r) => !gone(r)) });
      dropPinned(set, get, rel);

      // Drop affected tabs; if the active note went with them, activate the
      // nearest surviving tab to its right (else the last one standing).
      const before = useTabs.getState().tabs;
      useTabs.getState().removeUnder(rel);
      if (
        view?.type === "note" &&
        view.note.kind === "vault" &&
        gone(view.note.rel)
      ) {
        const index = before.findIndex((tab) => sameTab(tab, view.note));
        const right = before.slice(index + 1).find((tab) => !goneTab(tab));
        const survivors = before.filter((tab) => !goneTab(tab));
        const next = right ?? survivors[survivors.length - 1] ?? null;
        get().setView(next ? viewOfTab(next) : null);
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
      const index = tabs.findIndex((tab) => sameTab(tab, note));
      const next = tabs[index + 1] ?? tabs[index - 1] ?? null;
      close(note);
      const { view } = get();
      if (view?.type === "note" && sameNote(view.note, note)) {
        get().setView(next ? viewOfTab(next) : null);
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
    broadcastSettings({ theme });
    try {
      await ipc.setTheme(theme);
    } catch (err) {
      oops(err);
    }
  },

  setLightPalette: async (lightPalette) => {
    applyPalettes({ light: lightPalette, dark: get().darkPalette });
    set({ lightPalette });
    broadcastSettings({ lightPalette });
    try {
      await ipc.setLightPalette(lightPalette);
    } catch (err) {
      oops(err);
    }
  },

  setDarkPalette: async (darkPalette) => {
    applyPalettes({ light: get().lightPalette, dark: darkPalette });
    set({ darkPalette });
    broadcastSettings({ darkPalette });
    try {
      await ipc.setDarkPalette(darkPalette);
    } catch (err) {
      oops(err);
    }
  },

  setOutlineSound: async (outlineSound) => {
    set({ outlineSound });
    broadcastSettings({ outlineSound });
    try {
      await ipc.setOutlineSound(outlineSound);
    } catch (err) {
      oops(err);
    }
  },

  setCursorAnimation: async (cursorAnimation) => {
    set({ cursorAnimation });
    broadcastSettings({ cursorAnimation });
    try {
      await ipc.setCursorAnimation(cursorAnimation);
    } catch (err) {
      oops(err);
    }
  },

  setImageUpload: async (imageUpload) => {
    set({ imageUpload });
    broadcastSettings({ imageUpload });
    try {
      await ipc.setImageUpload(imageUpload);
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
