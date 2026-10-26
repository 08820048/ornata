import { ipc } from "@/lib/ipc";
import type { Issue } from "@/lib/types";
import { t } from "@/stores/locale";

const bullets = (issue: Issue, suffix = "") => [
  `- ${issue.title}${suffix}`,
  ...issue.notes.map((note) => `  - ${note}`),
];

/** A milestone's finished work as a changelog to edit: one bullet per done issue, decisions beneath. */
export function changelogDraft(milestone: string, issues: Issue[]): string {
  const done = issues.filter((i) => i.milestone === milestone && i.status === "done");
  return [`# ${milestone}`, "", ...done.flatMap((i) => bullets(i)), ""].join("\n");
}

const iso = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, "0")))
    .join("-");

/** `today` (YYYY-MM-DD) minus `days`, in local calendar days. */
export function daysBefore(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return iso(new Date(y, m - 1, d - days));
}

/** The last seven days of a project: what finished (with its decisions), what is moving, what is late. */
export function weeklyReview(issues: Issue[], today: string): string {
  const since = daysBefore(today, 6);
  const done = issues.filter((i) => i.status === "done" && i.completed && i.completed >= since && i.completed <= today);
  const doing = issues.filter((i) => i.status === "doing");
  const late = issues.filter((i) => (i.status === "todo" || i.status === "doing") && i.due && i.due < today);
  const section = (heading: string, items: Issue[], suffix: (i: Issue) => string = () => "") =>
    items.length ? [`## ${heading} (${items.length})`, "", ...items.flatMap((i) => bullets(i, suffix(i))), ""] : [];
  return [
    `# ${t("projects.reviewHeading", { from: since, to: today })}`,
    "",
    ...(done.length === 0 ? [`> ${t("projects.reviewNoStamp")}`, ""] : []),
    ...section(t("projects.reviewDone"), done, (i) => (i.milestone ? ` (${i.milestone})` : "")),
    ...section(t("projects.reviewDoing"), doing, (i) => (i.agent ? ` +${i.agent}` : "")),
    ...section(t("projects.reviewLate"), late, (i) => ` @${i.due}`),
  ].join("\n");
}

export const todayIso = () => iso(new Date());

/** Create the doc inside the project and report its rel. */
export function createDoc(project: string, folder: string, title: string, content: string) {
  return ipc.createProjectDoc(project, folder, title, content);
}
