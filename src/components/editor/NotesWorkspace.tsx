import { NoteEditor } from "./NoteEditor";
import { noteKey, sameNote } from "@/lib/noteRef";
import { cx } from "@/lib/utils";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/**
 * One live editor pane per open note. Inactive panes stay mounted behind
 * display:none, so switching tabs is a pure class toggle — no parse, no
 * remount, cursor/undo/scroll intact. The whole workspace likewise just hides
 * (not unmounts) while todos/bookmarks are showing, so returning to notes is
 * instant too. The tab strip itself lives in the top bar (see AppShell).
 */
export function NotesWorkspace({ visible }: { visible: boolean }) {
  const tabs = useTabs((s) => s.tabs);
  const view = useVault((s) => s.view);
  const active = view?.type === "note" ? view.note : null;

  if (tabs.length === 0) return null;

  return (
    <div className={cx("absolute inset-0", !visible && "hidden")}>
      {tabs.map((note) => (
        <div
          key={noteKey(note)}
          className={cx(
            "absolute inset-0",
            (!active || !sameNote(note, active)) && "hidden",
          )}
        >
          <NoteEditor
            note={note}
            active={visible && Boolean(active && sameNote(note, active))}
          />
        </div>
      ))}
    </div>
  );
}
