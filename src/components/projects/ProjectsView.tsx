import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IconCalendarStats, IconClipboardCopy, IconFileDescription, IconFileText, IconFileArrowRight, IconLayoutKanban, IconList, IconNotes } from "@tabler/icons-react";
import { openNoteAt } from "@/components/editor/NoteBacklinks";
import { ContextMenu, type MenuPosition } from "@/components/ui/ContextMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { parseInline } from "@/lib/inlineMarkdown";
import { ipc } from "@/lib/ipc";
import { hrefToRel } from "@/lib/noteLinks";
import { agentBrief } from "@/lib/agentBrief";
import { changelogDraft, createDoc, todayIso, weeklyReview } from "@/lib/projectDocs";
import { isPromoted, promoteIssue } from "@/lib/promoteIssue";
import { NOTES_CHANGED, notifyNotesChanged } from "@/lib/vaultEvents";
import type { Issue, IssueStatus } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useProjects } from "@/stores/projects";
import { useVault } from "@/stores/vault";
import { BoardView } from "./BoardView";
import { AgentBadge, PriorityIcon, STATUSES, STATUS_ICONS, StatusIcon, nextStatus } from "./issueIcons";

type Filter = "open" | "all";

interface Milestone {
  name: string | null;
  issues: Issue[];
}

interface NoteGroup {
  rel: string;
  milestones: Milestone[];
}

const isOpen = (issue: Issue) => issue.status === "todo" || issue.status === "doing";

/** Notes in path order, each split into milestones in document order. */
function groupIssues(issues: Issue[], filter: Filter): NoteGroup[] {
  const groups: NoteGroup[] = [];
  for (const issue of issues) {
    let group = groups[groups.length - 1];
    if (group?.rel !== issue.rel) groups.push((group = { rel: issue.rel, milestones: [] }));
    let milestone = group.milestones[group.milestones.length - 1];
    if (!milestone || milestone.name !== issue.milestone) {
      group.milestones.push((milestone = { name: issue.milestone, issues: [] }));
    }
    milestone.issues.push(issue);
  }
  if (filter === "all") return groups;
  return groups
    .map((g) => ({ ...g, milestones: g.milestones.filter((m) => m.issues.some(isOpen)) }))
    .filter((g) => g.milestones.length > 0);
}

/**
 * The projects tab: every task line of the selected project's notes, grouped
 * by note and milestone (the heading above it) in document order. It is a
 * view over the markdown — a status change rewrites that one line's box.
 */
export function ProjectsView({ active }: { active: boolean }) {
  const t = useT();
  const selected = useProjects((s) => s.selected);
  const project = useProjects((s) => s.projects.find((p) => p.rel === s.selected) ?? null);
  const vaultVersion = useVault((s) => s.vaultVersion);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [failed, setFailed] = useState(false);
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

  const promote = async (issue: Issue) => {
    if (!selected) return;
    try {
      const rel = await promoteIssue(selected, issue);
      notifyNotesChanged();
      setNonce((n) => n + 1);
      void useProjects.getState().load();
      openNoteAt(rel, rel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setNonce((n) => n + 1);
    }
  };

  const makeDoc = async (folder: string, title: string, content: string) => {
    if (!selected) return;
    try {
      const rel = await createDoc(selected, folder, title, content);
      notifyNotesChanged();
      setNonce((n) => n + 1);
      toast.success(t("projects.docCreated", { title }));
      openNoteAt(rel, rel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };
  const makeReview = () =>
    makeDoc("Reviews", t("projects.reviewTitle", { date: todayIso() }), weeklyReview(issues ?? [], todayIso()));
  const makeChangelog = (milestone: string) =>
    makeDoc(
      "Changelogs",
      t("projects.changelogTitle", { milestone: plain(milestone) }),
      changelogDraft(milestone, issues ?? []),
    );

  const copyBrief = async (issue: Issue) => {
    try {
      await navigator.clipboard.writeText(agentBrief(project?.name ?? "", issue));
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
            <Tooltip label={t("projects.review")}>
              <button
                type="button"
                aria-label={t("projects.review")}
                onClick={() => void makeReview()}
                className="press grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                <IconCalendarStats size={14} stroke={1.75} />
              </button>
            </Tooltip>
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

        {failed && <p className="py-8 text-center text-[13px] text-faint">{t("projects.loadFailed")}</p>}
        {!failed && issues?.length === 0 && (
          <Empty text={t("projects.noIssues")} hint={t("projects.syntax")} />
        )}
        {!failed && issues && issues.length > 0 && mode === "board" && (
          <BoardView issues={issues} onStatus={setStatus} />
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
            {group.milestones.map((milestone, index) => (
              <MilestoneBlock
                key={`${milestone.name}:${index}`}
                milestone={milestone}
                filter={filter}
                onStatus={setStatus}
                onMenu={(issue, at) => setMenu({ issue, at })}
                onChangelog={makeChangelog}
              />
            ))}
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

function MilestoneBlock({
  milestone,
  filter,
  onStatus,
  onMenu,
  onChangelog,
}: {
  milestone: Milestone;
  filter: Filter;
  onStatus: (issue: Issue, status: IssueStatus) => void;
  onMenu: (issue: Issue, at: MenuPosition) => void;
  onChangelog: (milestone: string) => void;
}) {
  const t = useT();
  const shown = filter === "all" ? milestone.issues : milestone.issues.filter(isOpen);
  const counted = milestone.issues.filter((i) => i.status !== "canceled");
  const done = counted.filter((i) => i.status === "done").length;
  return (
    <div className="group/ms mb-4">
      {milestone.name && (
        <div className="flex items-center gap-2 border-b border-line-soft px-2 pb-1.5 pt-2">
          <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
            {plain(milestone.name)}
          </span>
          <span className="shrink-0 text-[11.5px] tabular-nums text-faint">
            {done}/{counted.length}
          </span>
          {done > 0 && (
            <Tooltip label={t("projects.changelog")}>
              <button
                type="button"
                aria-label={t("projects.changelog")}
                onClick={() => onChangelog(milestone.name!)}
                className={cx(
                  "ml-auto grid h-5 w-5 shrink-0 place-items-center rounded transition-colors duration-100 hover:bg-hover hover:text-ink",
                  done === counted.length ? "text-muted" : "text-faint opacity-0 group-hover/ms:opacity-100",
                )}
              >
                <IconFileDescription size={13} stroke={1.75} />
              </button>
            </Tooltip>
          )}
        </div>
      )}
      <ul className="pt-1">
        {shown.map((issue) => (
          <IssueRow
            key={`${issue.rel}:${issue.line}`}
            issue={issue}
            onStatus={onStatus}
            onMenu={onMenu}
          />
        ))}
      </ul>
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

const plain = (markdown: string) => parseInline(markdown, "").map((p) => p.text).join("");

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
