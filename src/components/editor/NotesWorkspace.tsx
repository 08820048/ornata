import { NoteEditor } from "./NoteEditor";
import { GraphView } from "@/components/graph/GraphView";
import { isNoteTab, sameTab, tabKey, tabOfView } from "@/lib/noteRef";
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
 */
export function NotesWorkspace({ visible }: { visible: boolean }) {
  const tabs = useTabs((s) => s.tabs);
  const view = useVault((s) => s.view);
  const active = view ? tabOfView(view) : null;

  if (tabs.length === 0) return null;

  return (
    <div className={cx("absolute inset-0", !visible && "hidden")}>
      {tabs.map((tab) => {
        const isActive = visible && Boolean(active && sameTab(tab, active));
        return (
          <div
            key={tabKey(tab)}
            aria-hidden={!isActive}
            inert={!isActive}
            className={cx(
              "absolute inset-0",
              !isActive && "pointer-events-none invisible",
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
