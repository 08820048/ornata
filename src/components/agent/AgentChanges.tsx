import { FilePlus2, PencilLine, Undo2 } from "lucide-react";
import { openNoteAt } from "@/components/editor/NoteBacklinks";
import { cx } from "@/lib/utils";
import { type AgentChange, useAgent } from "@/stores/agent";
import { useT } from "@/stores/locale";

const titleOf = (path: string) => (path.split("/").pop() ?? path).replace(/\.md$/i, "");

/**
 * The notes a reply changed, each with a one-click Undo. Undo is refused
 * (with the reason shown) when the note has been edited since — the host
 * never overwrites the user's own later work.
 */
export function AgentChanges({ changes }: { changes: AgentChange[] }) {
  const t = useT();
  const undoChange = useAgent((s) => s.undoChange);

  return (
    <ul className="mt-3 flex flex-col gap-1 border-t border-line-soft pt-3">
      {changes.map((change) => {
        const Icon = change.action === "edit" ? PencilLine : FilePlus2;
        const undone = change.state === "undone";
        return (
          <li key={change.id} className="flex flex-col">
            <div className="flex min-h-8 items-center gap-2">
              <Icon size={13} className="shrink-0 text-faint" />
              <span className="shrink-0 text-[11.5px] text-faint">
                {t(change.action === "edit" ? "agent.change.edited" : "agent.change.created")}
              </span>
              <button
                type="button"
                disabled={undone && change.action === "create"}
                onClick={() => openNoteAt(change.path, change.path)}
                title={change.path}
                className={cx(
                  "min-w-0 truncate text-left text-[12px] transition-colors",
                  // cx doesn't merge conflicting utilities: keep these exclusive.
                  undone
                    ? "text-faint line-through"
                    : "text-ink underline decoration-line underline-offset-2 hover:decoration-ink",
                )}
              >
                {titleOf(change.path)}
              </button>
              <span className="ml-auto shrink-0">
                {undone ? (
                  <span className="text-[11px] text-faint">{t("agent.change.undone")}</span>
                ) : (
                  <button
                    type="button"
                    disabled={change.state === "undoing"}
                    onClick={() => void undoChange(change.id)}
                    className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
                  >
                    <Undo2 size={12} />
                    {t(change.state === "undoing" ? "agent.change.undoing" : "agent.change.undo")}
                  </button>
                )}
              </span>
            </div>
            {change.state === "failed" && change.error && (
              <p className="pb-1 pl-[21px] text-[11px] leading-snug text-muted">{change.error}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
