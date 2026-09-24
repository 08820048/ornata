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
