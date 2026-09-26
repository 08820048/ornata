import { create } from "zustand";

type SaveState = "idle" | "saving" | "error";

interface UiState {
  paletteOpen: boolean;
  tasksOpen: boolean;
  tagsOpen: boolean;
  agentOpen: boolean;
  sidebarHidden: boolean;
  markdownSource: boolean;
  saveState: SaveState;
  setPaletteOpen: (open: boolean) => void;
  setTasksOpen: (open: boolean) => void;
  setTagsOpen: (open: boolean) => void;
  setAgentOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleMarkdownSource: () => void;
  setSaveState: (state: SaveState) => void;
}

export const useUi = create<UiState>((set, get) => ({
  paletteOpen: false,
  tasksOpen: false,
  tagsOpen: false,
  agentOpen: false,
  sidebarHidden: false,
  markdownSource: false,
  saveState: "idle",
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setTasksOpen: (tasksOpen) => set({ tasksOpen }),
  setTagsOpen: (tagsOpen) => set({ tagsOpen }),
  setAgentOpen: (agentOpen) => set({ agentOpen }),
  toggleSidebar: () => set({ sidebarHidden: !get().sidebarHidden }),
  toggleMarkdownSource: () =>
    set({ markdownSource: !get().markdownSource }),
  setSaveState: (saveState) => set({ saveState }),
}));
