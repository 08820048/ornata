/**
 * A NodeView's position, or null when ProseMirror can't say yet. `getPos`
 * throws while the document view is still being built (a view created in the
 * middle of an update asks before its parent has registered it).
 */
export function nodePos(getPos: () => number | undefined): number | null {
  try {
    const pos = getPos();
    return typeof pos === "number" ? pos : null;
  } catch {
    return null;
  }
}
