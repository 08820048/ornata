import { AtSign, Network, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { neighborhood } from "@/components/graph/neighborhood";
import { ipc } from "@/lib/ipc";
import { flattenNotes } from "@/lib/tree";
import type { TreeNode } from "@/lib/types";
import { cx } from "@/lib/utils";
import { noteReference, rankNotes } from "./mentions";
import type { AgentNoteReference } from "@/stores/agent";

export { mentionAt, noteReference } from "./mentions";
import { useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";

/* Composer context beyond the current note: @-mentioned notes and the
   current note's linked notes, both sent as references the model can read. */

export function useNoteCandidates(query: string | null, exclude: ReadonlySet<string>) {
  const tree = useVault((s) => s.tree);
  const notes = useMemo(() => flattenNotes(tree), [tree]);
  return useMemo(
    () => (query === null ? [] : rankNotes(notes, query, exclude)),
    [notes, query, exclude],
  );
}

/** The current vault note's direct links (both directions), loaded while the
 *  composer shows it; null until known. */
export function useLinkedNotes(rel: string | null): AgentNoteReference[] | null {
  const tree = useVault((s) => s.tree);
  const [linked, setLinked] = useState<AgentNoteReference[] | null>(null);
  useEffect(() => {
    setLinked(null);
    if (!rel) return;
    let cancelled = false;
    ipc
      .linkGraph()
      .then((graph) => {
        if (cancelled) return;
        const hood = neighborhood(graph, rel, 1);
        setLinked([...hood.depth].filter(([, d]) => d === 1).map(([other]) => noteReference(other)));
      })
      .catch(() => {
        if (!cancelled) setLinked([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rel, tree]);
  return linked;
}

export function MentionPicker({
  notes,
  active,
  onPick,
}: {
  notes: TreeNode[];
  active: number;
  onPick: (note: TreeNode) => void;
}) {
  const t = useT();
  return (
    <div
      role="listbox"
      aria-label={t("agent.mention.aria")}
      className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-line bg-bg p-1 shadow-xl shadow-black/10"
    >
      {notes.length === 0 ? (
        <p className="px-2.5 py-2 text-[12px] text-faint">{t("agent.mention.none")}</p>
      ) : (
        notes.map((note, index) => {
          const folder = note.rel.includes("/") ? note.rel.slice(0, note.rel.lastIndexOf("/")) : "";
          return (
            <button
              key={note.rel}
              type="button"
              role="option"
              aria-selected={index === active}
              // Keep focus in the textarea.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick(note)}
              className={cx(
                "flex w-full min-w-0 items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-left",
                index === active ? "bg-invert text-invert-ink" : "text-ink hover:bg-hover",
              )}
            >
              <span className="truncate text-[12.5px]">{note.name.replace(/\.md$/i, "")}</span>
              {folder && (
                <span className={cx("truncate text-[10.5px]", index === active ? "opacity-60" : "text-faint")}>
                  {folder}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

export function MentionChip({ note, onRemove }: { note: AgentNoteReference; onRemove: () => void }) {
  const t = useT();
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-lg bg-hover pl-2 pr-1 text-[11.5px] text-ink">
      <AtSign size={11} className="shrink-0 text-faint" />
      <span className="truncate">{note.title}</span>
      <button
        type="button"
        aria-label={t("agent.mention.remove", { title: note.title })}
        onClick={onRemove}
        className="grid size-5 shrink-0 place-items-center rounded text-faint hover:bg-active hover:text-ink"
      >
        <X size={11} />
      </button>
    </span>
  );
}

/** Opt-in: send the current note's linked notes along. */
export function LinkedToggle({
  count,
  on,
  onToggle,
}: {
  count: number;
  on: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={t("agent.linked.hint")}
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11.5px] transition-colors duration-100",
        on ? "bg-invert text-invert-ink" : "text-muted hover:bg-hover hover:text-ink",
      )}
    >
      <Network size={12} />
      {t("agent.linked.label", { count })}
    </button>
  );
}
