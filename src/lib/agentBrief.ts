import { hrefToRel } from "@/lib/noteLinks";
import type { Issue } from "@/lib/types";

const STATUS = { todo: "todo", doing: "in progress", done: "done", canceled: "canceled" } as const;

/**
 * A task and its surroundings as a prompt to hand to a coding agent: where the
 * line lives, what is already decided, the page behind it, and how to report
 * back through the Ornata MCP tools.
 */
export function agentBrief(project: string, issue: Issue): string {
  const link = /\[[^\]]+\]\(([^)\s]+)\)/.exec(issue.title);
  const page = link ? hrefToRel(link[1]) : null;
  const meta = [
    issue.priority && `priority: ${issue.priority}`,
    issue.due && `due: ${issue.due}`,
    issue.tags.length > 0 && `tags: ${issue.tags.map((t) => `#${t}`).join(" ")}`,
  ].filter(Boolean);
  const lines = [
    `Work on this issue from the Ornata project "${project}":`,
    "",
    `> ${issue.title}`,
    "",
    `- Status: ${STATUS[issue.status]}`,
    ...(meta.length > 0 ? [`- ${meta.join(" · ")}`] : []),
    `- Where it is written: ${issue.rel}, line ${issue.line + 1}`,
    ...(page ? [`- Its page: ${page} (read it first)`] : []),
  ];
  if (issue.notes.length > 0) {
    lines.push("", "Decisions and notes already recorded under it:", ...issue.notes.map((n) => `- ${n}`));
  }
  lines.push(
    "",
    "With the Ornata MCP tools: read the notes above with read_note, call claim_issue (path, line, text from list_issues) before you start, add_decision for what you decide, and set_issue_status to done when finished.",
  );
  return lines.join("\n");
}
