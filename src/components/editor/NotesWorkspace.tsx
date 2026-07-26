import { NoteEditor } from "./NoteEditor";
import { noteKey, sameNote } from "@/lib/noteRef";
import { cx } from "@/lib/utils";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/**
 * One live editor pane per open note. Inactive panes stay mounted and retain
 * layout behind visibility:hidden, so switching tabs is a paint-only class
 * toggle — no parse, remount, or full-document reflow. The whole workspace
 * likewise just hides (not unmounts) while todos/bookmarks are showing. The
 * tab strip itself lives in the top bar (see AppShell).
 */
export function NotesWorkspace({ visible }: { visible: boolean }) {
  const tabs = useTabs((s) => s.tabs);
  const view = useVault((s) => s.view);
  const active = view?.type === "note" ? view.note : null;

  if (tabs.length === 0) return null;

  return (
    <div className={cx("absolute inset-0", !visible && "hidden")}>
      {tabs.map((note) => {
        const isActive = visible && Boolean(active && sameNote(note, active));
        return (
          <div
            key={noteKey(note)}
            aria-hidden={!isActive}
            inert={!isActive}
            className={cx(
              "absolute inset-0",
              !isActive && "pointer-events-none invisible",
            )}
          >
            <NoteEditor note={note} active={isActive} />
          </div>
        );
      })}
    </div>
  );
}
