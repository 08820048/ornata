/** Copy both an HTML rendering and its plain-text source, so rich targets
 *  (mail, chat apps) get formatting while plain targets stay usable. */
export async function writeRich(html: string, plain: string): Promise<void> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    // Fall through to the plain-text fallback.
  }
  await navigator.clipboard.writeText(plain);
}
