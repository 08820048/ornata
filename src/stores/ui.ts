import { create } from "zustand";

type SaveState = "idle" | "saving" | "error";

const SHORTCUT_BAR_KEY = "ornata.shortcutBarHidden";
const readShortcutBarHidden = () => {
  try {
    return localStorage.getItem(SHORTCUT_BAR_KEY) === "1";
  } catch {
    return false;
  }
};

/** Sidebar visibility to return to when focus mode ends. */
let restoreSidebar = false;

interface UiState {
  paletteOpen: boolean;
  mcpOpen: boolean;
  /** The palette was opened to pick a note for a new pane. */
  paletteAside: boolean;
  tasksOpen: boolean;
  tagsOpen: boolean;
  saveTemplateOpen: boolean;
  unusedAssetsOpen: boolean;
  sidebarHidden: boolean;
  shortcutBarHidden: boolean;
  focusMode: boolean;
  markdownSource: boolean;
  saveState: SaveState;
  /** Status-bar slot the active note portals its cursor / history / word info into. */
  statusInfoEl: HTMLElement | null;
  setStatusInfoEl: (el: HTMLElement | null) => void;
  setMcpOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  openPaletteAside: () => void;
  setTasksOpen: (open: boolean) => void;
  setTagsOpen: (open: boolean) => void;
  setSaveTemplateOpen: (open: boolean) => void;
  setUnusedAssetsOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleShortcutBar: () => void;
  /** Hide the sidebar and fade the chrome; leaving restores the sidebar. */
  toggleFocusMode: () => void;
  toggleMarkdownSource: () => void;
  setSaveState: (state: SaveState) => void;
}

export const useUi = create<UiState>((set, get) => ({
  statusInfoEl: null,
  setStatusInfoEl: (statusInfoEl) => set({ statusInfoEl }),
  paletteOpen: false,
  paletteAside: false,
  mcpOpen: false,
  tasksOpen: false,
  tagsOpen: false,
  saveTemplateOpen: false,
  unusedAssetsOpen: false,
  sidebarHidden: false,
  shortcutBarHidden: readShortcutBarHidden(),
  focusMode: false,
  markdownSource: false,
  saveState: "idle",
  setMcpOpen: (mcpOpen) => set({ mcpOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen, paletteAside: false }),
  openPaletteAside: () => set({ paletteOpen: true, paletteAside: true }),
  setTasksOpen: (tasksOpen) => set({ tasksOpen }),
  setTagsOpen: (tagsOpen) => set({ tagsOpen }),
  setSaveTemplateOpen: (saveTemplateOpen) => set({ saveTemplateOpen }),
  setUnusedAssetsOpen: (unusedAssetsOpen) => set({ unusedAssetsOpen }),
  toggleSidebar: () => set({ sidebarHidden: !get().sidebarHidden }),
  toggleShortcutBar: () => {
    const shortcutBarHidden = !get().shortcutBarHidden;
    try {
      localStorage.setItem(SHORTCUT_BAR_KEY, shortcutBarHidden ? "1" : "0");
    } catch {
      /* private mode: the toggle still works for this session */
    }
    set({ shortcutBarHidden });
  },
  toggleFocusMode: () => {
    const { focusMode, sidebarHidden } = get();
    if (focusMode) {
      set({ focusMode: false, sidebarHidden: restoreSidebar });
    } else {
      restoreSidebar = sidebarHidden;
      set({ focusMode: true, sidebarHidden: true });
    }
  },
  toggleMarkdownSource: () =>
    set({ markdownSource: !get().markdownSource }),
  setSaveState: (saveState) => set({ saveState }),
}));
