import { ipc } from "@/lib/ipc";
import { relToHref } from "@/lib/noteLinks";
import type { Issue } from "@/lib/types";

/** A task line that is already just a link to its own page. */
export const isPromoted = (issue: Issue) => /^\[[^\]]+\]\([^)\s]+\)$/.test(issue.title.trim());

/** The task line's text once it points at `rel`; tags, priority, dates, claim and times stay on the line. */
export function promotedText(issue: Issue, rel: string): string {
  const label = issue.title.replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim();
  return [
    `[${label}](${relToHref(rel)})`,
    ...issue.tags.map((tag) => `#${tag}`),
    ...(issue.priority ? [`!${issue.priority}`] : []),
    ...(issue.due ? [`@${issue.due}`] : []),
    ...(issue.agent ? [`+${issue.agent}`] : []),
    ...(issue.created ? [`◷${issue.created}`] : []),
    ...(issue.closed && issue.status === "done" ? [`✓${issue.closed}`] : []),
    ...(issue.closed && issue.status === "canceled" ? [`✗${issue.closed}`] : []),
  ].join(" ");
}

/**
 * Give a task its own page in the project's `issues/` folder and turn the
 * line into a link to it. Returns the new note's rel.
 */
export async function promoteIssue(project: string, issue: Issue): Promise<string> {
  const rel = await ipc.createIssueNote(project, issue.title);
  await ipc.replaceIssueText(issue.rel, issue.line, issue.text, promotedText(issue, rel));
  return rel;
}
