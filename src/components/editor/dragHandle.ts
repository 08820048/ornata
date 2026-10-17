import { DragHandle } from "@tiptap/extension-drag-handle";

const GRIP =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  [5, 12, 19]
    .flatMap((y) => [9, 15].map((x) => `<circle cx="${x}" cy="${y}" r="1.8"/>`))
    .join("") +
  "</svg>";

/**
 * A grip in the left margin of whichever block the pointer is over — a list
 * or task item gets its own. Drag it to move the block. (⌥↑ / ⌥↓ do the same
 * from the keyboard; see moveBlock.ts.)
 */
export const BlockDragHandle = DragHandle.configure({
  nested: true,
  render() {
    const handle = document.createElement("div");
    handle.className = "block-handle";
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "Drag to move");
    handle.innerHTML = GRIP;
    return handle;
  },
});
