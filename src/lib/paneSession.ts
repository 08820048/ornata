import { emptyHistory, visit, type NavHistory } from "@/lib/navHistory";
import { isNoteTab, sameTab } from "@/lib/noteRef";
import type { PaneState } from "@/lib/split";
import type { TabRef } from "@/lib/types";

/** Keep only the history entries `valid` accepts (notes deleted since the
 *  last run), with the cursor on the nearest surviving entry. */
export function retainHistory(history: NavHistory, valid: (tab: TabRef) => boolean): NavHistory {
  const entries: TabRef[] = [];
  let index = -1;
  history.entries.forEach((tab, i) => {
    if (!valid(tab)) return;
    entries.push(tab);
    if (i <= history.index) index = entries.length - 1;
  });
  return entries.length ? { entries, index: Math.max(index, 0) } : emptyHistory;
}

function parseHistory(raw: unknown, parseTab: (value: unknown) => TabRef | null): NavHistory {
  if (!raw || typeof raw !== "object") return emptyHistory;
  const { entries, index } = raw as { entries?: unknown; index?: unknown };
  const tabs = Array.isArray(entries) ? entries.map(parseTab).filter((t): t is TabRef => t !== null) : [];
  if (!tabs.length) return emptyHistory;
  const at = typeof index === "number" && Number.isInteger(index) ? index : tabs.length - 1;
  return { entries: tabs, index: Math.min(Math.max(at, 0), tabs.length - 1) };
}

/** Rebuild the pane layout from a saved session. Panes whose note is gone are
 *  dropped along with their history; fewer than two panes left means no split
 *  (the survivor keeps its history). Never throws on a damaged session. */
export function restorePanes(
  raw: unknown,
  parseTab: (value: unknown) => TabRef | null,
  valid: (tab: TabRef) => boolean,
): PaneState {
  const saved = (raw && typeof raw === "object" ? raw : {}) as { split?: unknown; solo?: unknown };
  const solo = retainHistory(parseHistory(saved.solo, parseTab), valid);
  const split = saved.split && typeof saved.split === "object" ? (saved.split as Record<string, unknown>) : null;
  if (!split || !Array.isArray(split.panes)) return { split: null, solo };

  const rawHistories = Array.isArray(split.histories) ? split.histories : [];
  const rawSizes = Array.isArray(split.sizes) ? split.sizes : [];
  const kept: Array<{ tab: TabRef; history: NavHistory; size: number }> = [];
  split.panes.forEach((value, i) => {
    const tab = parseTab(value);
    if (!tab || !isNoteTab(tab) || !valid(tab)) return;
    let history = retainHistory(parseHistory(rawHistories[i], parseTab), valid);
    // A pane's trail ends at what it shows now.
    if (!history.entries[history.index] || !sameTab(history.entries[history.index], tab)) {
      history = visit(history, tab);
    }
    const size = typeof rawSizes[i] === "number" && rawSizes[i] > 0 ? (rawSizes[i] as number) : 1;
    kept.push({ tab, history, size });
  });

  if (kept.length < 2) return { split: null, solo: kept[0]?.history ?? solo };
  const total = kept.reduce((sum, pane) => sum + pane.size, 0);
  return {
    split: {
      panes: kept.map((pane) => pane.tab),
      sizes: kept.map((pane) => pane.size / total),
      histories: kept.map((pane) => pane.history),
    },
    solo: emptyHistory,
  };
}
