import { create } from "zustand";

type SaveState = "idle" | "saving" | "error";

interface UiState {
  paletteOpen: boolean;
  agentOpen: boolean;
  sidebarHidden: boolean;
  markdownSource: boolean;
  saveState: SaveState;
  setPaletteOpen: (open: boolean) => void;
  setAgentOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleMarkdownSource: () => void;
  setSaveState: (state: SaveState) => void;
}

export const useUi = create<UiState>((set, get) => ({
  paletteOpen: false,
  agentOpen: false,
  sidebarHidden: false,
  markdownSource: false,
  saveState: "idle",
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setAgentOpen: (agentOpen) => set({ agentOpen }),
  toggleSidebar: () => set({ sidebarHidden: !get().sidebarHidden }),
  toggleMarkdownSource: () =>
    set({ markdownSource: !get().markdownSource }),
  setSaveState: (saveState) => set({ saveState }),
}));
