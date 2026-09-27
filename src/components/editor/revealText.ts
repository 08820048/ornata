import type { Editor } from "@tiptap/core";

const FLASH_MS = 1600;

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Scroll the first text block containing `text` (a snippet's plain text) into
 * the middle of the view and flash it. Falls back to the snippet's head, then
 * its tail, since images/escapes can make the editor text differ slightly.
 * Returns false when nothing matched.
 */
/**
 * Scroll to the heading whose visible text matches `heading` (normalized,
 * exact match with a starts-with fallback for stray trailing punctuation in
 * the fragment) and flash it — the anchor-jump flavor of `revealText`.
 * Returns false when no heading matched.
 */
export function revealHeading(editor: Editor, heading: string): boolean {
  const target = normalize(heading);
  if (!target) return false;
  const headings = Array.from(
    editor.view.dom.querySelectorAll<HTMLElement>("h1, h2, h3"),
  );
  const el =
    headings.find((el) => normalize(el.textContent ?? "") === target) ??
    headings.find((el) => normalize(el.textContent ?? "").startsWith(target));
  if (!el) return false;
  el.scrollIntoView({ block: "start" });
  el.classList.remove("reveal-flash");
  void el.offsetWidth;
  el.classList.add("reveal-flash");
  window.setTimeout(() => el.classList.remove("reveal-flash"), FLASH_MS);
  return true;
}

export function revealText(editor: Editor, text: string): boolean {
  const full = normalize(text);
  if (!full) return false;
  const needles = [full, full.slice(0, 24), full.slice(-24)].filter(
    (needle) => needle.length >= Math.min(full.length, 4),
  );

  const { doc } = editor.state;
  for (const needle of needles) {
    let found = -1;
    doc.descendants((node, pos) => {
      if (found !== -1) return false;
      if (!node.isTextblock) return true;
      if (normalize(node.textContent).includes(needle)) found = pos;
      return false;
    });
    if (found === -1) continue;
    const dom = editor.view.nodeDOM(found);
    if (!(dom instanceof HTMLElement)) return false;
    dom.scrollIntoView({ block: "center" });
    dom.classList.remove("reveal-flash");
    // Restart the animation if the same block is revealed twice in a row.
    void dom.offsetWidth;
    dom.classList.add("reveal-flash");
    window.setTimeout(() => dom.classList.remove("reveal-flash"), FLASH_MS);
    return true;
  }
  return false;
}
