import { Extension } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";

export type MoveDirection = "up" | "down";

const ITEMS = new Set(["listItem", "taskItem"]);

/**
 * Swap the block the caret is in with its neighbour: the list or task item
 * when inside one (moved within its own list), otherwise the top-level block.
 * Returns null at the edge, so the key falls through to the default.
 */
export function moveBlock(state: EditorState, direction: MoveDirection): Transaction | null {
  const { $from, anchor, head } = state.selection;

  // The deepest list item around the caret, else the top-level block.
  let depth = 1;
  for (let d = $from.depth; d > 0; d -= 1) {
    if (ITEMS.has($from.node(d).type.name)) {
      depth = d;
      break;
    }
  }
  if ($from.depth < depth) return null;

  const parent = $from.node(depth - 1);
  const index = $from.index(depth - 1);
  const node = $from.node(depth);
  const start = $from.before(depth);
  const end = $from.after(depth);

  const neighbourIndex = direction === "up" ? index - 1 : index + 1;
  if (neighbourIndex < 0 || neighbourIndex >= parent.childCount) return null;
  const neighbour = parent.child(neighbourIndex);

  const tr = state.tr;
  let moved: number; // where the moved node now starts
  if (direction === "up") {
    moved = start - neighbour.nodeSize;
    tr.replaceWith(moved, end, [node, neighbour]);
  } else {
    moved = start + neighbour.nodeSize;
    tr.replaceWith(start, end + neighbour.nodeSize, [neighbour, node]);
  }
  // Keep the caret (or selection) on the same text inside the moved node.
  const shift = moved - start;
  tr.setSelection(TextSelection.create(tr.doc, anchor + shift, head + shift));
  return tr.scrollIntoView();
}

/** ⌥↑ / ⌥↓ move the current block or list item up and down. */
export const MoveBlock = Extension.create({
  name: "moveBlock",
  addKeyboardShortcuts() {
    const run = (direction: MoveDirection) => () => {
      const tr = moveBlock(this.editor.state, direction);
      if (!tr) return false;
      this.editor.view.dispatch(tr);
      return true;
    };
    return { "Alt-ArrowUp": run("up"), "Alt-ArrowDown": run("down") };
  },
});
