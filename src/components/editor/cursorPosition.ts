import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";

export interface CursorPos {
  line: number;
  col: number;
}

/** 1-based line and column of `pos`: each text block is a line, and so is
 *  every newline inside a code block or after a hard break. */
export function cursorPosition(doc: PMNode, pos: number): CursorPos | null {
  const $pos = doc.resolve(pos);
  if (!$pos.parent.isTextblock) return null;
  let line = 1;
  doc.nodesBetween(0, $pos.before(), (node) => {
    if (!node.isTextblock) return true;
    line += node.textBetween(0, node.content.size, "", "\n").split("\n").length;
    return false;
  });
  const before = $pos.parent.textBetween(0, $pos.parentOffset, "", "\n").split("\n");
  return { line: line + before.length - 1, col: before[before.length - 1].length + 1 };
}

/** The cursor's line/column, kept current while the editor is in use. */
export function useCursorPosition(editor: Editor | null, enabled: boolean) {
  const [pos, setPos] = useState<CursorPos | null>(null);
  useEffect(() => {
    if (!editor || !enabled) return;
    const sync = () => {
      const next = cursorPosition(editor.state.doc, editor.state.selection.head);
      setPos((prev) => (prev && next && prev.line === next.line && prev.col === next.col ? prev : next));
    };
    sync();
    editor.on("selectionUpdate", sync);
    editor.on("update", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("update", sync);
    };
  }, [editor, enabled]);
  return pos;
}
