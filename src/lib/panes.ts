import { tabKey, tabOfView, viewOfTab } from "@/lib/noteRef";
import { nextPane } from "@/lib/split";
import type { TabRef } from "@/lib/types";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/** Focus `tab`'s pane and put the caret in its editor — switching the view
 *  alone leaves keyboard focus wherever it was. */
export function focusPane(tab: TabRef) {
  useVault.getState().setView(viewOfTab(tab));
  const key = tabKey(tab);
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(`[data-pane="${CSS.escape(key)}"] .ProseMirror`)
      ?.focus();
  });
}

/** ⌘1–⌘4: jump to the nth pane (1-based). Returns whether there was one. */
export function focusPaneNumber(n: number): boolean {
  const pane = useTabs.getState().split?.panes[n - 1];
  if (!pane) return false;
  focusPane(pane);
  return true;
}

/** ⌘.: move focus to the next pane, wrapping around. */
export function focusNextPane(): boolean {
  const { split } = useTabs.getState();
  const view = useVault.getState().view;
  if (!split || !view) return false;
  const next = nextPane(split, tabOfView(view));
  if (!next) return false;
  focusPane(next);
  return true;
}
