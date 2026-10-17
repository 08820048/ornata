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

interface UiState {
  paletteOpen: boolean;
  tasksOpen: boolean;
  tagsOpen: boolean;
  saveTemplateOpen: boolean;
  unusedAssetsOpen: boolean;
  agentOpen: boolean;
  sidebarHidden: boolean;
  shortcutBarHidden: boolean;
  markdownSource: boolean;
  saveState: SaveState;
  setPaletteOpen: (open: boolean) => void;
  setTasksOpen: (open: boolean) => void;
  setTagsOpen: (open: boolean) => void;
  setSaveTemplateOpen: (open: boolean) => void;
  setUnusedAssetsOpen: (open: boolean) => void;
  setAgentOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleShortcutBar: () => void;
  toggleMarkdownSource: () => void;
  setSaveState: (state: SaveState) => void;
}

export const useUi = create<UiState>((set, get) => ({
  paletteOpen: false,
  tasksOpen: false,
  tagsOpen: false,
  saveTemplateOpen: false,
  unusedAssetsOpen: false,
  agentOpen: false,
  sidebarHidden: false,
  shortcutBarHidden: readShortcutBarHidden(),
  markdownSource: false,
  saveState: "idle",
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setTasksOpen: (tasksOpen) => set({ tasksOpen }),
  setTagsOpen: (tagsOpen) => set({ tagsOpen }),
  setSaveTemplateOpen: (saveTemplateOpen) => set({ saveTemplateOpen }),
  setUnusedAssetsOpen: (unusedAssetsOpen) => set({ unusedAssetsOpen }),
  setAgentOpen: (agentOpen) => set({ agentOpen }),
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
  toggleMarkdownSource: () =>
    set({ markdownSource: !get().markdownSource }),
  setSaveState: (saveState) => set({ saveState }),
}));
