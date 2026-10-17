/** Daily notes live at `journal/YYYY-MM-DD.md`; `@today` style mentions are
 *  plain Markdown links to those paths. */
const pad = (n: number) => String(n).padStart(2, "0");

export const dateStamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const dailyRel = (date: Date) => `journal/${dateStamp(date)}.md`;

/** The date a daily-note rel points at, or null for any other note. */
export function parseDailyRel(rel: string): Date | null {
  const match = /^journal\/(\d{4})-(\d{2})-(\d{2})\.md$/i.exec(rel);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // Reject overflow like 2026-02-31 rolling into March.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Offsets offered by the `@` menu. */
export const DATE_MENTIONS = [
  { id: "today", offset: 0, keywords: "today now 今天 今日" },
  { id: "tomorrow", offset: 1, keywords: "tomorrow next 明天 明日" },
  { id: "yesterday", offset: -1, keywords: "yesterday previous 昨天 昨日" },
] as const;
