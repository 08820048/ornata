import { useEffect, useMemo, useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { openNoteAt } from "@/components/editor/NoteBacklinks";
import { parseInline } from "@/lib/inlineMarkdown";
import { columnIssues, priorityRank } from "@/lib/issueOrder";
import { hrefToRel } from "@/lib/noteLinks";
import type { Issue, IssueStatus } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { AgentBadge, PriorityIcon, STATUSES, StampLabel, StatusIcon } from "./issueIcons";

const keyOf = (issue: Issue) => `${issue.rel}:${issue.line}`;

/** Under the pointer, a card beats the column it sits in. */
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const cards = hits.filter((hit) => String(hit.id).includes(":"));
  if (cards.length) return cards;
  return hits.length ? hits : rectIntersection(args);
};

/** Status columns; dropping a card on one rewrites that task's box. */
export function BoardView({
  issues,
  onStatus,
  onMove,
  onAdd,
  onMenu,
}: {
  issues: Issue[];
  onStatus: (issue: Issue, status: IssueStatus) => void;
  /** Drop a card next to another one of the same column and note: reorder the lines. */
  onMove: (issue: Issue, target: Issue, after: boolean) => void;
  /** Create a task with `text` in `status`; resolves true when it was written. */
  onAdd: (status: IssueStatus, text: string) => Promise<boolean>;
  /** Right-click on a card: the same menu the list rows have. */
  onMenu: (issue: Issue, at: { x: number; y: number }) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragging, setDragging] = useState<Issue | null>(null);
  const byKey = useMemo(() => new Map(issues.map((i) => [keyOf(i), i])), [issues]);

  const [overId, setOverId] = useState<string | null>(null);
  const overStatus = overId ? (byKey.get(overId)?.status ?? (overId as IssueStatus)) : null;

  const onStart = (event: DragStartEvent) => setDragging(byKey.get(String(event.active.id)) ?? null);
  const onOver = (event: DragOverEvent) => setOverId(event.over ? String(event.over.id) : null);
  const stop = () => {
    setDragging(null);
    setOverId(null);
  };
  const onEnd = (event: DragEndEvent) => {
    stop();
    const issue = byKey.get(String(event.active.id));
    if (!issue || !event.over) return;
    const target = byKey.get(String(event.over.id));
    if (!target) return onStatus(issue, event.over.id as IssueStatus);
    if (target.status !== issue.status) return onStatus(issue, target.status);
    // Same column: the order is the order of lines, so only cards of one note
    // (and, in progress, of one priority, which sorts first) can trade places.
    if (target === issue || target.rel !== issue.rel || target.depth !== issue.depth) return;
    if (issue.status === "doing" && priorityRank(issue.priority) !== priorityRank(target.priority)) return;
    const column = columnIssues(issues, issue.status);
    onMove(issue, target, column.indexOf(issue) < column.indexOf(target));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={onEnd}
      onDragCancel={stop}
    >
      <div className="grid grid-cols-4 items-start gap-3">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            issues={columnIssues(issues, status)}
            active={overStatus === status}
            overId={overId}
            onAdd={onAdd}
            onMenu={onMenu}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{dragging && <Card issue={dragging} overlay />}</DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  issues,
  active,
  overId,
  onAdd,
  onMenu,
}: {
  status: IssueStatus;
  issues: Issue[];
  /** The drag is over this column or one of its cards. */
  active: boolean;
  /** The card or column the drag is over. */
  overId: string | null;
  onAdd: (status: IssueStatus, text: string) => Promise<boolean>;
  onMenu: (issue: Issue, at: { x: number; y: number }) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={cx(
        "min-h-[160px] min-w-0 rounded-lg p-1.5 transition-colors duration-100",
        active ? "bg-active" : "bg-sunken/60",
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
          <DraggableCard key={keyOf(issue)} issue={issue} over={overId === keyOf(issue)} onMenu={onMenu} />
        ))}
      </div>
    </section>
  );
}

function DraggableCard({
  issue,
  over,
  onMenu,
}: {
  issue: Issue;
  /** Another card is being dragged over this one. */
  over: boolean;
  onMenu: (issue: Issue, at: { x: number; y: number }) => void;
}) {
  const drag = useDraggable({ id: keyOf(issue) });
  const drop = useDroppable({ id: keyOf(issue) });
  const { listeners, attributes, isDragging } = drag;
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...listeners}
      {...attributes}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenu(issue, { x: event.clientX, y: event.clientY });
      }}
      className={cx("touch-none rounded-md", isDragging && "opacity-40", over && !isDragging && "ring-1 ring-ink/40")}
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
        "min-w-0 cursor-pointer overflow-hidden rounded-md border border-line-soft bg-bg px-2.5 py-2 transition-colors duration-100 hover:border-line",
        overlay && "shadow-lg shadow-black/10",
      )}
    >
      <div
        className={cx(
          "line-clamp-4 text-[13px] leading-[1.45] [overflow-wrap:anywhere]",
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
        {issue.doneBy && <AgentBadge name={issue.doneBy} done />}
        {issue.tags.slice(0, 2).map((tag) => (
          <span key={tag} className="shrink-0 rounded bg-sunken px-1.5 leading-[16px] text-muted">
            #{tag}
          </span>
        ))}
        {issue.due && <span className="shrink-0 tabular-nums">{issue.due.slice(5)}</span>}
        <StampLabel issue={issue} />
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
