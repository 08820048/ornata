import type { MessageKey } from "@/lib/i18n";

/** Every app-level keyboard shortcut, the single source for the settings list
 *  and the bottom hint bar. Handlers live in App.tsx / usePaneDialogs.ts. */
export interface Shortcut {
  keys: string[];
  label: MessageKey;
}

export const SHORTCUTS = {
  palette: { keys: ["⌘", "K"], label: "settings.shortcut.palette" },
  newNote: { keys: ["⌘", "N"], label: "settings.shortcut.newNote" },
  dailyNote: { keys: ["⌘", "J"], label: "settings.shortcut.dailyNote" },
  openFile: { keys: ["⌘", "O"], label: "settings.shortcut.openFile" },
  find: { keys: ["⌘", "F"], label: "settings.shortcut.find" },
  back: { keys: ["⌘", "["], label: "settings.shortcut.back" },
  forward: { keys: ["⌘", "]"], label: "settings.shortcut.forward" },
  split: { keys: ["⌘", "⇧", "\\"], label: "settings.shortcut.split" },
  sidebar: { keys: ["⌘", "\\"], label: "settings.shortcut.sidebar" },
  focus: { keys: ["⌘", "⇧", "F"], label: "settings.shortcut.focus" },
  theme: { keys: ["⌘", "⇧", "D"], label: "settings.shortcut.theme" },
  settings: { keys: ["⌘", ","], label: "settings.shortcut.settings" },
  closeTab: { keys: ["⌘", "W"], label: "settings.shortcut.closeTab" },
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
