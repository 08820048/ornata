import {
  IconAlertSquareFilled,
  IconAntennaBars2,
  IconAntennaBars3,
  IconAntennaBars5,
  IconCircle,
  IconCircleCheckFilled,
  IconCircleHalf2,
  IconCircleX,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import type { IssuePriority, IssueStatus } from "@/lib/types";
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

const PRIORITY_ICONS: Record<IssuePriority, TablerIcon> = {
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
