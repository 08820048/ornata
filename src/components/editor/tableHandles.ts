import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import { t } from "@/stores/locale";

/**
 * Two bars that appear at the edges of the table under the pointer: one along
 * its bottom adds a row, one along its right side adds a column. They live in
 * an overlay beside the editor's DOM, not in the document, so they never end
 * up in the Markdown or the selection.
 */
class HandlesView {
  private readonly host: HTMLElement;
  /** Where the pointer is tracked: the whole scrolling page, so the gap
   *  between a table and its bars (outside the editor's own box) still counts. */
  private readonly area: HTMLElement;
  /** The pane, told while a table is hot so the outline on its right edge —
   *  whose hover zone overlaps the column bar — stands down. */
  private readonly pane: HTMLElement | null;
  private readonly addRow = bar("table-add table-add-row");
  private readonly addColumn = bar("table-add table-add-column");
  private table: HTMLTableElement | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly editor: Editor,
  ) {
    this.host = view.dom.parentElement ?? view.dom;
    if (getComputedStyle(this.host).position === "static") this.host.style.position = "relative";
    this.area = view.dom.closest<HTMLElement>(".page-scroll") ?? this.host;
    this.pane = view.dom.closest<HTMLElement>("[data-pane]");
    this.host.append(this.addRow, this.addColumn);
    this.area.addEventListener("pointermove", this.onMove);
    this.area.addEventListener("pointerleave", this.hide);
    this.addRow.addEventListener("mousedown", (event) => this.add(event, "row"));
    this.addColumn.addEventListener("mousedown", (event) => this.add(event, "column"));
  }

  update() {
    // The table may have grown, shrunk or gone since the pointer last moved.
    if (this.table && !this.table.isConnected) this.hide();
    else this.place();
  }

  destroy() {
    this.area.removeEventListener("pointermove", this.onMove);
    this.area.removeEventListener("pointerleave", this.hide);
    this.pane?.removeAttribute("data-table-hot");
    this.addRow.remove();
    this.addColumn.remove();
  }

  private readonly onMove = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (target?.closest(".table-add")) return;
    const table = target?.closest?.("table") ?? null;
    if (table === this.table) return;
    // Crossing the gap between the table and a bar must not drop the bars.
    if (!table && this.table) {
      const rect = this.table.getBoundingClientRect();
      const near =
        event.clientX >= rect.left - 4 &&
        event.clientX <= rect.right + 24 &&
        event.clientY >= rect.top - 4 &&
        event.clientY <= rect.bottom + 24;
      if (near) return;
    }
    this.table = table instanceof HTMLTableElement && this.view.dom.contains(table) ? table : null;
    this.place();
  };

  private readonly hide = () => {
    this.table = null;
    this.place();
  };

  private place() {
    const shown = Boolean(this.table) && this.view.editable;
    this.addRow.dataset.shown = String(shown);
    this.addColumn.dataset.shown = String(shown);
    if (shown) this.pane?.setAttribute("data-table-hot", "true");
    else this.pane?.removeAttribute("data-table-hot");
    if (!shown || !this.table) return;
    const host = this.host.getBoundingClientRect();
    const rect = this.table.getBoundingClientRect();
    const left = rect.left - host.left;
    const top = rect.top - host.top;
    this.addRow.setAttribute("aria-label", t("table.addRow"));
    this.addColumn.setAttribute("aria-label", t("table.addColumn"));
    Object.assign(this.addRow.style, {
      left: `${left}px`,
      top: `${top + rect.height + 4}px`,
      width: `${rect.width}px`,
    });
    Object.assign(this.addColumn.style, {
      left: `${left + rect.width + 4}px`,
      top: `${top}px`,
      height: `${rect.height}px`,
    });
  }

  private add(event: MouseEvent, what: "row" | "column") {
    // Keep the editor's focus; the selection is set explicitly below.
    event.preventDefault();
    if (!this.table || !this.view.editable) return;
    const cell = lastCellPos(this.view, this.table, what);
    if (cell === null) return;
    const chain = this.editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setSelection(TextSelection.near(tr.doc.resolve(cell + 1)));
        return true;
      });
    (what === "row" ? chain.addRowAfter() : chain.addColumnAfter()).run();
  }
}

/** Document position of the cell a new row (or column) goes after: the last
 *  cell of the table, or the last cell of its first row. */
export function lastCellPos(view: EditorView, table: HTMLElement, what: "row" | "column") {
  const inside = view.posAtDOM(table, 0);
  const $pos = view.state.doc.resolve(inside);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "table") continue;
    const map = TableMap.get(node);
    const index = what === "row" ? map.map.length - 1 : map.width - 1;
    return $pos.start(depth) + map.map[index];
  }
  const node = view.state.doc.nodeAt(inside);
  if (node?.type.name !== "table") return null;
  const map = TableMap.get(node);
  return inside + 1 + map.map[what === "row" ? map.map.length - 1 : map.width - 1];
}

function bar(className: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.contentEditable = "false";
  button.tabIndex = -1;
  button.dataset.shown = "false";
  button.textContent = "+";
  return button;
}

export const TableHandles = Extension.create({
  name: "tableHandles",
  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: new PluginKey("tableHandles"),
        view: (view) => new HandlesView(view, editor),
      }),
    ];
  },
});
