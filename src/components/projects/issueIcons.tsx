import {
  IconAlertSquareFilled,
  IconAntennaBars2,
  IconAntennaBars3,
  IconAntennaBars5,
  IconCalendarCheck,
  IconCalendarPlus,
  IconCalendarX,
  IconCircle,
  IconCircleCheckFilled,
  IconCircleHalf2,
  IconCircleX,
  IconRobot,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { shownStamp, stampDay, stampText } from "@/lib/stamps";
import { agentLogo, agentLogoArt } from "./agentLogos";
import type { Issue, IssuePriority, IssueStatus } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";

export const STATUSES: IssueStatus[] = ["todo", "doing", "done", "canceled"];

export const STATUS_ICONS: Record<IssueStatus, TablerIcon> = {
  todo: IconCircle,
  doing: IconCircleHalf2,
  done: IconCircleCheckFilled,
  canceled: IconCircleX,
};

/** A click walks todo → in progress → done → todo; canceling is a menu choice. */
export function nextStatus(status: IssueStatus): IssueStatus {
  return status === "todo" ? "doing" : status === "doing" ? "done" : "todo";
}

export function StatusIcon({ status, size = 16 }: { status: IssueStatus; size?: number }) {
  const Icon = STATUS_ICONS[status];
  return (
    <Icon
      size={size}
      stroke={2}
      className={cx(
        "transition-colors duration-100",
        status === "done" && "text-todo",
        status === "doing" && "text-ink",
        status === "todo" && "text-faint group-hover:text-muted",
        status === "canceled" && "text-faint",
      )}
    />
  );
}

export const PRIORITIES: IssuePriority[] = ["urgent", "high", "medium", "low"];

export const PRIORITY_ICONS: Record<IssuePriority, TablerIcon> = {
  urgent: IconAlertSquareFilled,
  high: IconAntennaBars5,
  medium: IconAntennaBars3,
  low: IconAntennaBars2,
};

export function PriorityIcon({ priority }: { priority: IssuePriority }) {
  const t = useT();
  const Icon = PRIORITY_ICONS[priority];
  return (
    <span title={t(`projects.priority.${priority}`)} className="shrink-0">
      <Icon
        size={14}
        stroke={2}
        aria-label={t(`projects.priority.${priority}`)}
        className={priority === "urgent" || priority === "high" ? "text-ink" : "text-faint"}
      />
    </span>
  );
}

/** An agent's own logo, or a generic robot for one we do not know. */
export function AgentMark({ name, size = 12 }: { name: string; size?: number }) {
  const logo = agentLogo(name);
  if (!logo) return <IconRobot size={size} stroke={2} />;
  const { evenodd, svg } = agentLogoArt(logo);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule={evenodd ? "evenodd" : undefined}
      clipRule={evenodd ? "evenodd" : undefined}
      aria-hidden="true"
      className="shrink-0"
      // Static markup bundled with the app (agentLogoData.ts), never user input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Shown on an issue an agent has claimed. */
export function AgentBadge({ name, done }: { name: string; done?: boolean }) {
  const t = useT();
  return (
    <span
      title={t(done ? "projects.agentDone" : "projects.agentWorking", { name })}
      className="flex shrink-0 items-center gap-1 rounded bg-sunken px-1.5 text-[11px] leading-[18px] text-muted"
    >
      <AgentMark name={name} />
      {name}
    </span>
  );
}

/** Created / finished day of an issue; the full times are in the tooltip. */
export function StampLabel({ issue }: { issue: Issue }) {
  const t = useT();
  const shown = shownStamp(issue);
  if (!shown) return null;
  const ended = issue.status === "done" || issue.status === "canceled";
  const tip = [
    issue.created && t("projects.stampCreated", { time: stampText(issue.created) }),
    ended && issue.closed && t(issue.status === "done" ? "projects.stampDone" : "projects.stampCanceled", { time: stampText(issue.closed) }),
  ]
    .filter(Boolean)
    .join("\n");
  const Icon = ended && issue.closed ? (issue.status === "done" ? IconCalendarCheck : IconCalendarX) : IconCalendarPlus;
  return (
    <span title={tip} className="flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-faint">
      <Icon size={12} stroke={1.75} />
      {stampDay(shown)}
    </span>
  );
}
