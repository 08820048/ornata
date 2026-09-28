/**
 * PDF bookmark outline from a note's headings. Each entry names its parent
 * (index into the same list, -1 for top level) so the backend only has to
 * attach nodes — a skipped level (h1 → h3) nests under the nearest shallower
 * heading rather than inventing an empty one.
 */
export interface OutlineEntry {
  text: string;
  parent: number;
}

export function outlineFromHeadings(
  headings: readonly { level: number; text: string }[],
): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const stack: { level: number; index: number }[] = [];
  for (const heading of headings) {
    const text = heading.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
    entries.push({ text, parent: stack.length > 0 ? stack[stack.length - 1].index : -1 });
    stack.push({ level: heading.level, index: entries.length - 1 });
  }
  return entries;
}

/** Headings of a rendered note, in document order. */
export function headingsOf(root: HTMLElement): { level: number; text: string }[] {
  return Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")).map(
    (el) => ({ level: Number(el.tagName.slice(1)), text: el.textContent ?? "" }),
  );
}
