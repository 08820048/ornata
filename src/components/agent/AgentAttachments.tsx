import { BookOpenText, PencilLine, TextQuote, X } from "lucide-react";
import { ApprovalPreview } from "@/components/agent/ApprovalPreview";
import { type AgentNoteReference, type AgentSelection } from "@/stores/agent";
import { useT } from "@/stores/locale";

export function ApprovalCard({
  approval,
  onRespond,
}: {
  approval: { resource: string; action: string; args: Record<string, unknown> };
  onRespond: (allow: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="mb-2 rounded-2xl border border-line bg-bg p-3 shadow-lg shadow-black/5">
      <div className="flex items-start gap-2.5">
        <PencilLine className="mt-1 shrink-0 text-muted" size={15} />
        <ApprovalPreview approval={approval} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => onRespond(false)} className="h-8 rounded-lg px-3 text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink">
          {t("agent.approval.deny")}
        </button>
        <button type="button" onClick={() => onRespond(true)} className="h-8 rounded-lg bg-invert px-3 text-[11px] font-medium text-invert-ink transition-transform active:scale-[0.97]">
          {t("agent.approval.allow")}
        </button>
      </div>
    </div>
  );
}

export function NoteAttachment({
  note,
  onRemove,
}: {
  note: AgentNoteReference;
  onRemove?: () => void;
}) {
  const t = useT();

  return (
    <div className="relative mb-1 flex min-h-12 items-center gap-2.5 rounded-xl bg-hover p-2 pr-10">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-soft bg-bg text-muted">
        <BookOpenText size={14} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-ink" title={note.title}>
          {note.title}
        </span>
        <span className="mt-0.5 block text-[10.5px] text-faint">
          {t("agent.currentNote")}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={t("agent.removeNote")}
          onClick={onRemove}
          className="absolute right-0 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-faint transition-[background-color,color,transform] duration-100 hover:bg-active hover:text-ink active:scale-[0.96]"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function SelectionAttachment({
  selection,
  compact = false,
  onRemove,
}: {
  selection: AgentSelection;
  compact?: boolean;
  onRemove?: () => void;
}) {
  const t = useT();
  const label = `${t("agent.selection")} · ${selection.title}`;

  if (!compact) {
    return (
      <div className="mb-3 rounded-xl bg-hover px-3 py-2.5">
        <div className="flex items-center gap-2 text-[10.5px] text-faint">
          <TextQuote size={12.5} />
          <span className="truncate">{label}</span>
        </div>
        <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-muted">
          {selection.text}
        </p>
      </div>
    );
  }

  const preview = selection.text.replace(/\s+/g, " ").trim();
  return (
    <div className="relative mb-1 flex min-h-14 items-center gap-2.5 rounded-xl bg-hover p-2 pr-10">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-soft bg-bg text-muted">
        <TextQuote size={14} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-ink" title={selection.text}>
          {preview}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-faint">
          {label}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={t("agent.removeSelection")}
          onClick={onRemove}
          className="absolute right-0 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-faint transition-[background-color,color,transform] duration-100 hover:bg-active hover:text-ink active:scale-[0.96]"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
