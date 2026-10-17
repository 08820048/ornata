import { NoteEditor } from "./NoteEditor";
import { GraphView } from "@/components/graph/GraphView";
import { isNoteTab, sameTab, tabKey, tabOfView, viewOfTab } from "@/lib/noteRef";
import type { TabRef } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/**
 * One live pane per open tab — an editor per note, the graph for the graph
 * tab. Inactive panes stay mounted and retain
 * layout behind visibility:hidden, so switching tabs is a paint-only class
 * toggle — no parse, remount, or full-document reflow. The whole workspace
 * likewise just hides (not unmounts) when no note is active. The tab strip
 * itself lives in the top bar (see AppShell).
 *
 * With a split open, the two split notes sit side by side and both stay
 * visible; only the focused one is `active` (it owns shortcuts, find, outline
 * and the word count). Clicking the other side moves focus without moving it.
 */
export function NotesWorkspace({ visible }: { visible: boolean }) {
  const tabs = useTabs((s) => s.tabs);
  const split = useTabs((s) => s.split);
  const view = useVault((s) => s.view);
  const active = view ? tabOfView(view) : null;

  if (tabs.length === 0) return null;

  const side = (tab: TabRef): "left" | "right" | null => {
    if (!split || !visible) return null;
    if (sameTab(tab, split.left)) return "left";
    return sameTab(tab, split.right) ? "right" : null;
  };

  return (
    <div className={cx("absolute inset-0", !visible && "hidden")}>
      {tabs.map((tab) => {
        const isActive = visible && Boolean(active && sameTab(tab, active));
        const place = side(tab);
        const shown = isActive || place !== null;
        return (
          <div
            key={tabKey(tab)}
            aria-hidden={!shown}
            inert={!shown}
            onMouseDownCapture={
              place && !isActive
                ? () => useVault.getState().setView(viewOfTab(tab))
                : undefined
            }
            className={cx(
              "absolute inset-y-0",
              place === "left" && "left-0 right-1/2",
              place === "right" && "left-1/2 right-0 border-l border-line-soft",
              place === null && "inset-x-0",
              !shown && "pointer-events-none invisible",
            )}
          >
            {isNoteTab(tab) ? (
              <NoteEditor note={tab} active={isActive} />
            ) : (
              <GraphView active={isActive} />
            )}
          </div>
        );
      })}
    </div>
  );
}
