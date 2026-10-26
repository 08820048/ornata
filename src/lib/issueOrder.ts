import type { Issue, IssuePriority, IssueStatus } from "@/lib/types";

const RANK: Record<IssuePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** 0 for urgent down to 4 for no priority. */
export const priorityRank = (priority: IssuePriority | null) => (priority ? RANK[priority] : 4);

/**
 * The issues of one board column, in the order shown. In progress is what
 * you are working on, so it leads with the most urgent; every other column
 * keeps the order of the notes. Equal priorities keep their note order.
 */
export function columnIssues(issues: Issue[], status: IssueStatus): Issue[] {
  const column = issues.filter((issue) => issue.status === status);
  if (status !== "doing") return column;
  return column
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => priorityRank(a.issue.priority) - priorityRank(b.issue.priority) || a.index - b.index)
    .map(({ issue }) => issue);
}
