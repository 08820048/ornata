import { parseInline, plainText } from "@/lib/inlineMarkdown";
import { ipc } from "@/lib/ipc";
import { relToHref } from "@/lib/noteLinks";
import type { Issue } from "@/lib/types";

/** A task line that is already just a link to its own page. */
export const isPromoted = (issue: Issue) => /^\[[^\]]+\]\([^)\s]+\)$/.test(issue.title.trim());

const SOURCE = /\s*\[([^\]]+)\]\(([^)\s]+)\)\s*$/;
const MAX_NAME = 60;

/**
 * A task made from selected text ends in a link back to the note it came
 * from. That link is the task's source, not part of its name.
 */
export function splitSource(title: string): { text: string; source: { label: string; href: string } | null } {
  const match = SOURCE.exec(title);
  const text = match ? title.slice(0, match.index).trim() : "";
  return match && text
    ? { text, source: { label: match[1], href: match[2] } }
    : { text: title.trim(), source: null };
}

/** `text` as plain words: links reduced to their labels, no brackets left over. */
function plainLabel(text: string): string {
  return plainText(parseInline(text, "")).replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/** The task line's text once it points at `rel`; tags, priority, dates, claim and times stay on the line. */
export function promotedText(issue: Issue, rel: string): string {
  const label = plainLabel(splitSource(issue.title).text);
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
 * line into a link to it. The page is named after the task (shortened if it
 * is long, with the full text inside) and keeps a link to where the task
 * came from. Returns the new note's rel.
 */
export async function promoteIssue(project: string, issue: Issue, sourceLabel: string): Promise<string> {
  const { text, source } = splitSource(issue.title);
  const full = plainLabel(text);
  const name = full.length > MAX_NAME ? `${full.slice(0, MAX_NAME).trimEnd()}…` : full;
  const body = [
    ...(name === full ? [] : [full]),
    ...(source ? [`${sourceLabel}: [${plainLabel(source.label)}](${source.href})`] : []),
  ].join("\n\n");
  const rel = await ipc.createIssueNote(project, name, body);
  await ipc.replaceIssueText(issue.rel, issue.line, issue.text, promotedText(issue, rel));
  return rel;
}
