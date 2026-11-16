import { create } from "zustand";

/** Which folder the library tab is showing ("" = the vault's top level). */
interface LibraryState {
  dir: string;
  setDir: (dir: string) => void;
}

export const useLibrary = create<LibraryState>((set) => ({
  dir: "",
  setDir: (dir) => set({ dir }),
}));
