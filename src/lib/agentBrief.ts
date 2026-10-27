import { hrefToRel } from "@/lib/noteLinks";
import type { Backlink, Issue } from "@/lib/types";

const MAX_NOTES = 5;
const MAX_SNIPPETS = 2;
const MAX_SNIPPET = 200;

/** The page a task line links to, if it is one (see `promoteIssue`). */
export function issuePage(issue: Issue): string | null {
  const link = /\[[^\]]+\]\(([^)\s]+)\)/.exec(issue.title);
  return link ? hrefToRel(link[1]) : null;
}

const STATUS = { todo: "todo", doing: "in progress", done: "done", canceled: "canceled" } as const;

/**
 * A task and its surroundings as a prompt to hand to a coding agent: where the
 * line lives, what is already decided, the page behind it, and how to report
 * back through the Ornata MCP tools. `backlinks` are the notes that link to
 * its page; the note the task is written in is left out, the line already
 * says where it is.
 */
export function agentBrief(project: string, issue: Issue, backlinks: Backlink[] = []): string {
  const page = issuePage(issue);
  const linking = backlinks.filter((b) => b.rel !== issue.rel);
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
  if (linking.length > 0) {
    lines.push("", "Other notes that link to its page:");
    for (const b of linking.slice(0, MAX_NOTES)) {
      lines.push(`- ${b.title} (${b.rel})`);
      for (const snippet of b.snippets.slice(0, MAX_SNIPPETS)) {
        const text = snippet.replace(/\s+/g, " ").trim();
        lines.push(`  > ${text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET)}…` : text}`);
      }
    }
    if (linking.length > MAX_NOTES) lines.push(`- …and ${linking.length - MAX_NOTES} more`);
  }
  lines.push(
    "",
    "With the Ornata MCP tools: read the notes above with read_note, call claim_issue (path, line, text from list_issues) before you start, add_decision for what you decide, and set_issue_status to done when finished.",
  );
  return lines.join("\n");
}
