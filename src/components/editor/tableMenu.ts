import type { Editor } from "@tiptap/core";
import { isInTable, selectedRect } from "@tiptap/pm/tables";
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconColumnInsertLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconRowRemove,
  IconTableOff,
} from "@tabler/icons-react";
import type { MenuItem } from "@/components/ui/ContextMenu";
import { t } from "@/stores/locale";

export type ColumnAlign = "left" | "center" | "right";

/**
 * Align every cell of the column(s) under the selection. Markdown aligns
 * whole columns (`:---:` in the divider row), so the attribute is set on each
 * cell of the column rather than on the one cell clicked.
 */
export function setColumnAlign(editor: Editor, align: ColumnAlign | null) {
  return editor
    .chain()
    .focus()
    .command(({ state, tr, dispatch }) => {
      if (!isInTable(state)) return false;
      if (!dispatch) return true;
      const rect = selectedRect(state);
      const seen = new Set<number>();
      for (let row = 0; row < rect.map.height; row += 1) {
        for (let col = rect.left; col < rect.right; col += 1) {
          const pos = rect.map.map[row * rect.map.width + col];
          const cell = rect.table.nodeAt(pos);
          if (!cell || seen.has(pos)) continue;
          seen.add(pos);
          tr.setNodeMarkup(rect.tableStart + pos, undefined, { ...cell.attrs, align });
        }
      }
      return true;
    })
    .run();
}

/** The alignment of the column the selection is in (null = default, left). */
export function columnAlign(editor: Editor): ColumnAlign | null {
  const { state } = editor;
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const cell = rect.table.nodeAt(rect.map.map[rect.top * rect.map.width + rect.left]);
  return (cell?.attrs.align as ColumnAlign | null | undefined) ?? null;
}

/** Right-click in a table: rows, columns, alignment, and removing the table. */
export function tableMenuItems(editor: Editor): MenuItem[] {
  const run = (command: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () =>
    void command(editor.chain().focus()).run();
  const current = columnAlign(editor) ?? "left";
  const align = (value: ColumnAlign, label: string, icon: MenuItem["icon"]): MenuItem[] =>
    // The alignment already in effect isn't offered.
    current === value ? [] : [{ label, icon, onSelect: () => void setColumnAlign(editor, value === "left" ? null : value) }];
  return [
    { label: t("table.rowAbove"), icon: IconRowInsertTop, onSelect: run((c) => c.addRowBefore()) },
    { label: t("table.rowBelow"), icon: IconRowInsertBottom, onSelect: run((c) => c.addRowAfter()) },
    { label: t("table.columnLeft"), icon: IconColumnInsertLeft, onSelect: run((c) => c.addColumnBefore()) },
    { label: t("table.columnRight"), icon: IconColumnInsertRight, onSelect: run((c) => c.addColumnAfter()) },
    ...align("left", t("table.alignLeft"), IconAlignLeft),
    ...align("center", t("table.alignCenter"), IconAlignCenter),
    ...align("right", t("table.alignRight"), IconAlignRight),
    { label: t("table.deleteRow"), icon: IconRowRemove, onSelect: run((c) => c.deleteRow()) },
    { label: t("table.deleteColumn"), icon: IconColumnRemove, onSelect: run((c) => c.deleteColumn()) },
    { label: t("table.delete"), icon: IconTableOff, danger: true, onSelect: run((c) => c.deleteTable()) },
  ];
}
