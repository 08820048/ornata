import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { ActionSwapText } from "@/components/motion/action-swap";
import { noteKey, noteTitle } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";
import { useT } from "@/stores/locale";

/**
 * Folder path → title breadcrumb for the active note. Folders are static and
 * muted; only the title cascades (via ActionSwapText) on note change, so the
 * animation stays short and fast regardless of how deep the note is nested.
 */
export function NoteBreadcrumb({ note }: { note: NoteRef }) {
  const t = useT();
  const parts = (note.kind === "vault" ? note.rel : note.path)
    .split("/")
    .filter(Boolean);
  const folders =
    note.kind === "vault"
      ? parts.slice(0, -1)
      : [t("common.external"), ...parts.slice(-2, -1)];
  const visibleFolders = folders.slice(-2);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[13.5px]">
      {folders.length > visibleFolders.length && (
        <>
          <span className="shrink-0 text-faint">…</span>
          <ChevronRight
            size={13}
            strokeWidth={2}
            className="shrink-0 text-faint"
          />
        </>
      )}
      {visibleFolders.map((folder, index) => (
        <Fragment key={index}>
          <span className="max-w-[140px] shrink-0 truncate text-muted">
            {folder}
          </span>
          <ChevronRight
            size={13}
            strokeWidth={2}
            className="shrink-0 text-faint"
          />
        </Fragment>
      ))}
      <span className="min-w-0 flex-1 overflow-hidden" title={noteTitle(note)}>
        <ActionSwapText
          value={noteKey(note)}
          animation="roll"
          className="max-w-full font-semibold text-ink"
        >
          {noteTitle(note)}
        </ActionSwapText>
      </span>
    </div>
  );
}
