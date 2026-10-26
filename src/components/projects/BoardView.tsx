import { useEffect, useMemo, useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { openNoteAt } from "@/components/editor/NoteBacklinks";
import { parseInline } from "@/lib/inlineMarkdown";
import { columnIssues } from "@/lib/issueOrder";
import { hrefToRel } from "@/lib/noteLinks";
import type { Issue, IssueStatus } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { AgentBadge, PriorityIcon, STATUSES, StatusIcon } from "./issueIcons";

const keyOf = (issue: Issue) => `${issue.rel}:${issue.line}`;

/** Status columns; dropping a card on one rewrites that task's box. */
export function BoardView({
  issues,
  onStatus,
  onAdd,
  onMenu,
}: {
  issues: Issue[];
  onStatus: (issue: Issue, status: IssueStatus) => void;
  /** Create a task with `text` in `status`; resolves true when it was written. */
  onAdd: (status: IssueStatus, text: string) => Promise<boolean>;
  /** Right-click on a card: the same menu the list rows have. */
  onMenu: (issue: Issue, at: { x: number; y: number }) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragging, setDragging] = useState<Issue | null>(null);
  const byKey = useMemo(() => new Map(issues.map((i) => [keyOf(i), i])), [issues]);

  const onStart = (event: DragStartEvent) => setDragging(byKey.get(String(event.active.id)) ?? null);
  const onEnd = (event: DragEndEvent) => {
    setDragging(null);
    const issue = byKey.get(String(event.active.id));
    if (issue && event.over) onStatus(issue, event.over.id as IssueStatus);
  };

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
      <div className="grid grid-cols-4 items-start gap-3">
        {STATUSES.map((status) => (
          <Column key={status} status={status} issues={columnIssues(issues, status)} onAdd={onAdd} onMenu={onMenu} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{dragging && <Card issue={dragging} overlay />}</DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  issues,
  onAdd,
  onMenu,
}: {
  status: IssueStatus;
  issues: Issue[];
  onAdd: (status: IssueStatus, text: string) => Promise<boolean>;
  onMenu: (issue: Issue, at: { x: number; y: number }) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={cx(
        "min-h-[160px] rounded-lg p-1.5 transition-colors duration-100",
        isOver ? "bg-active" : "bg-sunken/60",
      )}
    >
      <header className="flex items-center gap-1.5 px-1.5 pb-2 pt-1 text-[12px] font-medium text-muted">
        <StatusIcon status={status} size={14} />
        <span>{t(`projects.status.${status}`)}</span>
        <span className="tabular-nums text-faint">{issues.length}</span>
        <button
          type="button"
          aria-label={t("projects.addTo", { status: t(`projects.status.${status}`) })}
          title={t("projects.addTo", { status: t(`projects.status.${status}`) })}
          onClick={() => setAdding(true)}
          className="press ml-auto grid h-5 w-5 place-items-center rounded text-faint transition-colors duration-100 hover:bg-hover hover:text-ink"
        >
          <IconPlus size={14} stroke={1.75} />
        </button>
      </header>
      <div className="flex flex-col gap-1.5">
        {adding && (
          <NewCard
            onSubmit={(text) => onAdd(status, text)}
            onClose={() => setAdding(false)}
          />
        )}
        {issues.map((issue) => (
          <DraggableCard key={keyOf(issue)} issue={issue} onMenu={onMenu} />
        ))}
      </div>
    </section>
  );
}

function DraggableCard({
  issue,
  onMenu,
}: {
  issue: Issue;
  onMenu: (issue: Issue, at: { x: number; y: number }) => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: keyOf(issue) });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenu(issue, { x: event.clientX, y: event.clientY });
      }}
      className={cx("touch-none", isDragging && "opacity-40")}
    >
      <Card issue={issue} />
    </div>
  );
}

function Card({ issue, overlay }: { issue: Issue; overlay?: boolean }) {
  const closed = issue.status === "done" || issue.status === "canceled";
  const parts = parseInline(issue.title, issue.rel);
  const linked = /^\[[^\]]+\]\(([^)\s]+)\)$/.exec(issue.title.trim());
  const target = linked ? hrefToRel(linked[1]) : null;
  // Tasks.md / Backlog.md only hold lines added without a plan; their name says nothing about the task.
  const stem = issue.rel.replace(/\.md$/i, "").split("/").pop();
  const where = stem === "Tasks" || stem === "Backlog" ? "" : stem;
  return (
    <div
      onClick={() => (target ? openNoteAt(target, target) : openNoteAt(issue.rel, issue.rel, issue.title))}
      className={cx(
        "cursor-pointer rounded-md border border-line-soft bg-bg px-2.5 py-2 transition-colors duration-100 hover:border-line",
        overlay && "shadow-lg shadow-black/10",
      )}
    >
      <div
        className={cx(
          "text-[13px] leading-[1.45]",
          closed ? "text-faint" : "text-ink",
          issue.status === "canceled" && "line-through",
        )}
      >
        {parts.map((part, index) => (
          <span key={index} className={part.kind === "link" && !closed ? "text-accent" : undefined}>
            {part.text}
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-faint">
        <span className="min-w-0 flex-1 truncate">{where}</span>
        {issue.agent && <AgentBadge name={issue.agent} />}
        {issue.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="shrink-0 rounded bg-sunken px-1.5 leading-[16px] text-muted">
            #{tag}
          </span>
        ))}
        {issue.due && <span className="shrink-0 tabular-nums">{issue.due.slice(5)}</span>}
        {issue.priority && <PriorityIcon priority={issue.priority} />}
      </div>
    </div>
  );
}

/** An empty card to type into: Enter adds the task and stays open for the next one, Esc or leaving it empty closes. */
function NewCard({
  onSubmit,
  onClose,
}: {
  onSubmit: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  useEffect(() => ref.current?.focus(), []);
  const submit = async () => {
    const value = text.trim();
    if (!value) return onClose();
    setText("");
    if (!(await onSubmit(value))) setText(value);
  };
  return (
    <div className="rounded-md border border-line bg-bg px-2.5 py-2">
      <input
        ref={ref}
        value={text}
        placeholder={t("projects.newPlaceholder")}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          } else if (event.key === "Escape") onClose();
        }}
        onBlur={() => !text.trim() && onClose()}
        className="w-full bg-transparent text-[13px] leading-[1.45] text-ink outline-none placeholder:text-faint"
      />
    </div>
  );
}
