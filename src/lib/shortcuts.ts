import type { MessageKey } from "@/lib/i18n";
import { keyLabel } from "@/lib/utils";

const MOD = keyLabel("⌘");
const SHIFT = keyLabel("⇧");
const ALT = keyLabel("⌥");

/** Every app-level keyboard shortcut, the single source for the settings list
 *  and the bottom hint bar. Handlers live in App.tsx / usePaneDialogs.ts. */
export interface Shortcut {
  keys: string[];
  label: MessageKey;
}

export const SHORTCUTS = {
  palette: { keys: [MOD, "K"], label: "settings.shortcut.palette" },
  newNote: { keys: [MOD, "N"], label: "settings.shortcut.newNote" },
  dailyNote: { keys: [MOD, "J"], label: "settings.shortcut.dailyNote" },
  openFile: { keys: [MOD, "O"], label: "settings.shortcut.openFile" },
  find: { keys: [MOD, "F"], label: "settings.shortcut.find" },
  back: { keys: [MOD, "["], label: "settings.shortcut.back" },
  forward: { keys: [MOD, "]"], label: "settings.shortcut.forward" },
  split: { keys: [MOD, SHIFT, "\\"], label: "settings.shortcut.split" },
  paneJump: { keys: [MOD, "1–4"], label: "settings.shortcut.paneJump" },
  paneNext: { keys: [MOD, "."], label: "settings.shortcut.paneNext" },
  moveUp: { keys: [ALT, "↑"], label: "settings.shortcut.moveUp" },
  moveDown: { keys: [ALT, "↓"], label: "settings.shortcut.moveDown" },
  sidebar: { keys: [MOD, "\\"], label: "settings.shortcut.sidebar" },
  focus: { keys: [MOD, SHIFT, "F"], label: "settings.shortcut.focus" },
  theme: { keys: [MOD, SHIFT, "D"], label: "settings.shortcut.theme" },
  settings: { keys: [MOD, ","], label: "settings.shortcut.settings" },
  closeTab: { keys: [MOD, "W"], label: "settings.shortcut.closeTab" },
} satisfies Record<string, Shortcut>;

export type BarContext = "note" | "graph" | "empty";

const BAR: Record<BarContext, Shortcut[]> = {
  note: [
    SHORTCUTS.palette,
    SHORTCUTS.newNote,
    SHORTCUTS.dailyNote,
    SHORTCUTS.find,
    SHORTCUTS.back,
    SHORTCUTS.sidebar,
    SHORTCUTS.closeTab,
  ],
  graph: [
    SHORTCUTS.palette,
    SHORTCUTS.newNote,
    SHORTCUTS.back,
    SHORTCUTS.sidebar,
    SHORTCUTS.closeTab,
  ],
  empty: [SHORTCUTS.palette, SHORTCUTS.newNote, SHORTCUTS.dailyNote, SHORTCUTS.openFile],
};

export function barShortcuts(context: BarContext): Shortcut[] {
  return BAR[context];
}
