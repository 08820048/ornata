import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IconCircleOff, IconClipboardCopy, IconFileText, IconFileArrowRight, IconLayoutKanban, IconList, IconNotes, IconPlus } from "@tabler/icons-react";
import { openNoteAt } from "@/components/editor/NoteBacklinks";
import { ContextMenu, type MenuPosition } from "@/components/ui/ContextMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { parseInline } from "@/lib/inlineMarkdown";
import { ipc } from "@/lib/ipc";
import { hrefToRel } from "@/lib/noteLinks";
import { agentBrief, issuePage } from "@/lib/agentBrief";
import { isPromoted, promoteIssue } from "@/lib/promoteIssue";
import { NOTES_CHANGED, notifyNotesChanged } from "@/lib/vaultEvents";
import type { Issue, IssuePriority, IssueStatus } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useProjects } from "@/stores/projects";
import { useVault } from "@/stores/vault";
import { BoardView, NewCard } from "./BoardView";
import { AgentBadge, PRIORITIES, PRIORITY_ICONS, PriorityIcon, STATUSES, STATUS_ICONS, StampLabel, StatusIcon, nextStatus } from "./issueIcons";

type Filter = "open" | "all";

interface NoteGroup {
  rel: string;
  issues: Issue[];
}

const isOpen = (issue: Issue) => issue.status === "todo" || issue.status === "doing";

/** Notes in path order, each with its issues in document order. */
function groupIssues(issues: Issue[], filter: Filter): NoteGroup[] {
  const groups: NoteGroup[] = [];
  for (const issue of issues) {
    let group = groups[groups.length - 1];
    if (group?.rel !== issue.rel) groups.push((group = { rel: issue.rel, issues: [] }));
    group.issues.push(issue);
  }
  if (filter === "all") return groups;
  return groups
    .map((g) => ({ ...g, issues: g.issues.filter(isOpen) }))
    .filter((g) => g.issues.length > 0);
}

/**
 * The projects tab: every task line of the selected project's notes, grouped
 * by note in document order, or as a board of status columns. It is a view
 * over the markdown — a status or priority change rewrites that one line.
 */
export function ProjectsView({ active }: { active: boolean }) {
  const t = useT();
  const selected = useProjects((s) => s.selected);
  const project = useProjects((s) => s.projects.find((p) => p.rel === s.selected) ?? null);
  const vaultVersion = useVault((s) => s.vaultVersion);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  const [mode, setMode] = useState<"list" | "board">(() =>
    localStorage.getItem("ornata.projects.mode") === "board" ? "board" : "list",
  );
  const pickMode = (next: "list" | "board") => {
    setMode(next);
    localStorage.setItem("ornata.projects.mode", next);
  };
  const [nonce, setNonce] = useState(0);
  const [menu, setMenu] = useState<{ issue: Issue; at: MenuPosition } | null>(null);

  // Notes may have changed on disk (agents, other editors) while we were away.
  useEffect(() => {
    const bump = () => setNonce((n) => n + 1);
    window.addEventListener(NOTES_CHANGED, bump);
    return () => window.removeEventListener(NOTES_CHANGED, bump);
  }, []);

  useEffect(() => setIssues(null), [selected]);

  useEffect(() => {
    if (!active || !selected) return;
    let cancelled = false;
    ipc
      .projectIssues(selected)
      .then((list) => {
        if (cancelled) return;
        setIssues(list);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, selected, vaultVersion, nonce]);


  const groups = useMemo(() => groupIssues(issues ?? [], filter), [issues, filter]);
  const counted = (issues ?? []).filter((i) => i.status !== "canceled");
  const done = counted.filter((i) => i.status === "done").length;

  const setStatus = async (issue: Issue, status: IssueStatus) => {
    if (issue.status === status) return;
    const same = (i: Issue) => i.rel === issue.rel && i.line === issue.line;
    setIssues((list) => list?.map((i) => (same(i) ? { ...i, status } : i)) ?? list);
    try {
      await ipc.setIssueStatus(issue.rel, issue.line, issue.text, status);
      notifyNotesChanged();
      void useProjects.getState().load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setNonce((n) => n + 1);
    }
  };

  const moveIssue = async (issue: Issue, target: Issue, after: boolean) => {
    try {
      await ipc.moveIssue(issue.rel, issue.line, issue.text, target.line, target.text, after);
      notifyNotesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
    setNonce((n) => n + 1);
  };

  const promote = async (issue: Issue) => {
    if (!selected) return;
    try {
      const rel = await promoteIssue(selected, issue, t("projects.source"));
      notifyNotesChanged();
      setNonce((n) => n + 1);
      void useProjects.getState().load();
      openNoteAt(rel, rel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setNonce((n) => n + 1);
    }
  };

  const addIssue = async (status: IssueStatus, text: string) => {
    if (!selected) return false;
    try {
      await ipc.addIssue(selected, text, status);
      notifyNotesChanged();
      setNonce((n) => n + 1);
      void useProjects.getState().load();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const setPriority = async (issue: Issue, priority: IssuePriority | null) => {
    if (issue.priority === priority) return;
    try {
      await ipc.setIssuePriority(issue.rel, issue.line, issue.text, priority);
      notifyNotesChanged();
      setNonce((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setNonce((n) => n + 1);
    }
  };

  const copyBrief = async (issue: Issue) => {
    try {
      const page = issuePage(issue);
      // Backlinks are context, not the point: without them the brief is still worth copying.
      const backlinks = page ? await ipc.noteBacklinks(page).catch(() => []) : [];
      await navigator.clipboard.writeText(agentBrief(project?.name ?? "", issue, backlinks));
      toast.success(t("projects.briefCopied"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  if (!selected || !project) {
    return <Centered>{t("projects.pick")}</Centered>;
  }

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className={cx("mx-auto w-full px-8 pb-16 pt-10", mode === "board" ? "max-w-[1180px]" : "max-w-[760px]")}>
        <header className="mb-6">
          <h1 className="note-title text-[26px] font-[680] leading-[1.14] tracking-[-0.025em] text-ink">{project.name}</h1>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-sunken">
              <div
                className="h-full rounded-full bg-ink/70 transition-[width] duration-150 ease-out"
                style={{ width: `${counted.length ? (done / counted.length) * 100 : 0}%` }}
              />
            </div>
            <span className="shrink-0 text-[12px] tabular-nums text-muted">
              {t("projects.progress", { done, total: counted.length })}
            </span>
            <div className="flex shrink-0 rounded-md bg-sunken p-0.5">
              {(["list", "board"] as const).map((value) => {
                const Icon = value === "list" ? IconList : IconLayoutKanban;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    aria-label={t(value === "list" ? "projects.viewList" : "projects.viewBoard")}
                    title={t(value === "list" ? "projects.viewList" : "projects.viewBoard")}
                    onClick={() => pickMode(value)}
                    className={cx(
                      "grid h-5 w-7 place-items-center rounded-[5px] transition-colors duration-100",
                      mode === value ? "bg-bg text-ink shadow-sm" : "text-muted hover:text-ink",
                    )}
                  >
                    <Icon size={13} stroke={1.75} />
                  </button>
                );
              })}
            </div>
            {mode === "list" && (
            <div className="flex shrink-0 rounded-md bg-sunken p-0.5">
              {(["open", "all"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={cx(
                    "rounded-[5px] px-2.5 py-0.5 text-[12px] transition-colors duration-100",
                    filter === value ? "bg-bg text-ink shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  {t(value === "open" ? "projects.filterOpen" : "projects.filterAll")}
                </button>
              ))}
            </div>
            )}
          </div>
        </header>

        {mode === "list" && !failed && (
          <div className="mb-6">
            {adding ? (
              <NewCard onSubmit={(text) => addIssue("todo", text)} onClose={() => setAdding(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="press flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] text-faint transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                <IconPlus size={14} stroke={1.75} />
                {t("projects.addTask")}
              </button>
            )}
          </div>
        )}
        {failed && <p className="py-8 text-center text-[13px] text-faint">{t("projects.loadFailed")}</p>}
        {mode === "list" && !failed && issues?.length === 0 && (
          <Empty text={t("projects.noIssues")} hint={t("projects.syntax")} />
        )}
        {!failed && issues && mode === "board" && (
          <BoardView issues={issues} onStatus={setStatus} onMove={moveIssue} onAdd={addIssue} onMenu={(issue, at) => setMenu({ issue, at })} />
        )}
        {mode === "list" && !failed && issues && issues.length > 0 && groups.length === 0 && (
          <Empty text={t("projects.allDone")} />
        )}

        {mode === "list" && groups.map((group) => (
          <section key={group.rel} className="mb-8">
            <button
              type="button"
              onClick={() => openNoteAt(group.rel, group.rel)}
              className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-faint transition-colors duration-100 hover:text-ink"
            >
              <IconFileText size={12} stroke={2} className="shrink-0" />
              <span className="truncate">{group.rel.replace(/\.md$/i, "")}</span>
            </button>
            <ul>
              {group.issues.map((issue) => (
                <IssueRow
                  key={`${issue.rel}:${issue.line}`}
                  issue={issue}
                  onStatus={setStatus}
                  onMenu={(issue, at) => setMenu({ issue, at })}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {menu && (
        <ContextMenu
          position={menu.at}
          onClose={() => setMenu(null)}
          items={[
            ...STATUSES.map((status) => ({
              label: t(`projects.status.${status}`),
              icon: STATUS_ICONS[status],
              onSelect: () => void setStatus(menu.issue, status),
            })),
            ...PRIORITIES.map((priority) => ({
              label: t(`projects.priority.${priority}`),
              icon: PRIORITY_ICONS[priority],
              onSelect: () => void setPriority(menu.issue, priority),
            })),
            { label: t("projects.priority.none"), icon: IconCircleOff, onSelect: () => void setPriority(menu.issue, null) },
            { label: t("projects.copyBrief"), icon: IconClipboardCopy, onSelect: () => void copyBrief(menu.issue) },
            ...(isPromoted(menu.issue)
              ? []
              : [{ label: t("projects.promote"), icon: IconFileArrowRight, onSelect: () => void promote(menu.issue) }]),
          ]}
        />
      )}
    </div>
  );
}

function IssueRow({
  issue,
  onStatus,
  onMenu,
}: {
  issue: Issue;
  onStatus: (issue: Issue, status: IssueStatus) => void;
  onMenu: (issue: Issue, at: MenuPosition) => void;
}) {
  const t = useT();
  const closed = issue.status === "done" || issue.status === "canceled";
  const parts = parseInline(issue.title, issue.rel);
  // A line that is just a link to a note (`- [ ] [Spec](spec.md)`) is an
  // issue with its own page: open that page rather than the plan.
  const linked = /^\[[^\]]+\]\(([^)\s]+)\)$/.exec(issue.title.trim());
  const target = linked ? hrefToRel(linked[1]) : null;
  const menuAt = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onMenu(issue, { x: event.clientX, y: event.clientY });
  };

  return (
    <li
      className="group flex items-start gap-1 rounded-md transition-colors duration-100 hover:bg-hover"
      style={{ paddingLeft: issue.depth * 20 }}
      onContextMenu={menuAt}
    >
      <Tooltip label={t("projects.setStatus", { status: t(`projects.status.${issue.status}`) })}>
        <button
          type="button"
          aria-label={t("projects.setStatus", { status: t(`projects.status.${issue.status}`) })}
          onClick={() => onStatus(issue, nextStatus(issue.status))}
          onContextMenu={menuAt}
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-md"
        >
          <StatusIcon status={issue.status} />
        </button>
      </Tooltip>
      <button
        type="button"
        onClick={() =>
          target ? openNoteAt(target, target) : openNoteAt(issue.rel, issue.rel, issue.title)
        }
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left"
      >
        <span
          className={cx(
            "min-w-0 flex-1 truncate text-[13.5px] leading-5",
            closed ? "text-faint" : "text-ink",
            issue.status === "canceled" && "line-through",
          )}
        >
          {parts.map((part, index) =>
            part.kind === "link" ? (
              <span key={index} className={closed ? undefined : "text-accent"}>
                {part.text}
              </span>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
        </span>
        {issue.notes.length > 0 && (
          <span
            title={issue.notes.join("\n")}
            aria-label={t("projects.notes", { count: issue.notes.length })}
            className="flex shrink-0 items-center gap-0.5 text-[11.5px] tabular-nums text-faint"
          >
            <IconNotes size={13} stroke={1.75} />
            {issue.notes.length}
          </span>
        )}
        {issue.agent && <AgentBadge name={issue.agent} />}
        {issue.doneBy && <AgentBadge name={issue.doneBy} done />}
        {issue.tags.map((tag) => (
          <span key={tag} className="shrink-0 rounded bg-sunken px-1.5 text-[11px] leading-[18px] text-muted">
            #{tag}
          </span>
        ))}
        {issue.due && (
          <span
            className={cx(
              "shrink-0 text-[11.5px] tabular-nums",
              !closed && issue.due < today() ? "font-semibold text-ink" : "text-faint",
            )}
          >
            {issue.due.slice(5)}
          </span>
        )}
        <StampLabel issue={issue} />
        {issue.priority && <PriorityIcon priority={issue.priority} />}
      </button>
    </li>
  );
}

function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-[13px] text-faint">{children}</div>
  );
}

function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-[13px] text-faint">{text}</p>
      {hint && <p className="mt-2 font-mono text-[11.5px] text-faint">{hint}</p>}
    </div>
  );
}
