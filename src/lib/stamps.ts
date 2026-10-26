import type { Issue } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Now, to the minute, in local time: `2026-10-26T14:30`. */
export function stampNow(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `2026-10-26T14:30` → `2026-10-26 14:30`; a bare day stays a day. */
export function stampText(stamp: string): string {
  return stamp.replace("T", " ");
}

/** `2026-10-26T14:30` → `10-26`. */
export function stampDay(stamp: string): string {
  return stamp.slice(5, 10);
}

/** The date an issue's row or card shows: when it ended if it has, else when it was made. */
export function shownStamp(issue: Issue): string | null {
  const ended = issue.status === "done" || issue.status === "canceled";
  return (ended ? issue.closed : null) ?? issue.created;
}
