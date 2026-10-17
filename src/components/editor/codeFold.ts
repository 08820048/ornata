import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { collapseRange, foldRanges } from "@/lib/codeFold";

export const codeFoldKey = new PluginKey<FoldState>("codeFold");

interface FoldState {
  /** Folded lines, by the position of the end of their header line. */
  folded: Set<number>;
  /** Collapsed blocks, by the position of the block. */
  collapsed: Set<number>;
  /** Text ranges currently hidden. */
  hidden: Array<[number, number]>;
  decorations: DecorationSet;
}

export type FoldMeta = { fold: number } | { collapse: number };

/** Mermaid blocks render a diagram instead of text, so they don't fold. */
const foldable = (node: ProseMirrorNode) =>
  node.type.name === "codeBlock" && String(node.attrs.language ?? "").toLowerCase() !== "mermaid";

function ellipsis(label: string, dispatch: (view: import("@tiptap/pm/view").EditorView) => void) {
  return (view: import("@tiptap/pm/view").EditorView) => {
    const el = document.createElement("span");
    el.className = "code-fold-ellipsis";
    el.contentEditable = "false";
    el.textContent = label;
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      dispatch(view);
    });
    return el;
  };
}

function build(doc: ProseMirrorNode, folded: Set<number>, collapsed: Set<number>) {
  const decorations: Decoration[] = [];
  const hidden: Array<[number, number]> = [];
  const keptFolds = new Set<number>();
  const keptCollapsed = new Set<number>();

  doc.descendants((node, pos) => {
    if (!foldable(node)) return node.type.name === "codeBlock" ? false : true;
    const base = pos + 1;
    const text = node.textContent;

    if (collapsed.has(pos) && collapseRange(text)) {
      const range = collapseRange(text)!;
      keptCollapsed.add(pos);
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "code-collapsed" }));
      decorations.push(Decoration.inline(base + range.from, base + range.to, { class: "code-hidden" }));
      hidden.push([base + range.from, base + range.to]);
      decorations.push(
        Decoration.widget(
          base + range.from,
          ellipsis(`… ${range.lines}`, (view) =>
            view.dispatch(view.state.tr.setMeta(codeFoldKey, { collapse: pos } satisfies FoldMeta)),
          ),
          { side: -1, key: `collapsed-${pos}-${range.lines}` },
        ),
      );
      return false;
    }

    for (const fold of foldRanges(text)) {
      const anchor = base + fold.from;
      const isFolded = folded.has(anchor);
      if (isFolded) keptFolds.add(anchor);
      decorations.push(
        Decoration.widget(
          base + fold.lineStart,
          (view) => {
            const el = document.createElement("span");
            el.className = "code-fold";
            el.contentEditable = "false";
            el.setAttribute("role", "button");
            el.setAttribute("aria-expanded", String(!isFolded));
            el.dataset.folded = String(isFolded);
            el.addEventListener("mousedown", (event) => {
              event.preventDefault();
              view.dispatch(view.state.tr.setMeta(codeFoldKey, { fold: anchor } satisfies FoldMeta));
            });
            return el;
          },
          { side: -1, key: `code-fold-${anchor}-${isFolded}`, ignoreSelection: true },
        ),
      );
      if (isFolded) {
        decorations.push(Decoration.inline(anchor, base + fold.to, { class: "code-hidden" }));
        hidden.push([anchor, base + fold.to]);
        decorations.push(
          Decoration.widget(
            anchor,
            ellipsis(`⋯ ${fold.lines}`, (view) =>
              view.dispatch(view.state.tr.setMeta(codeFoldKey, { fold: anchor } satisfies FoldMeta)),
            ),
            { side: -1, key: `code-ellipsis-${anchor}-${fold.lines}` },
          ),
        );
      }
    }
    return false;
  });

  return {
    folded: keptFolds,
    collapsed: keptCollapsed,
    hidden,
    decorations: DecorationSet.create(doc, decorations),
  };
}

function mapSet(set: Set<number>, mapping: import("@tiptap/pm/transform").Mapping, assoc: 1 | -1) {
  const next = new Set<number>();
  for (const pos of set) {
    const result = mapping.mapResult(pos, assoc);
    if (!result.deleted) next.add(result.pos);
  }
  return next;
}

/** Fold arrows in a code block's gutter (by indentation), and whole-block
 *  collapse. View-only: the text is never changed, so copying copies it all. */
export const CodeFold = Extension.create({
  name: "codeFold",
  addProseMirrorPlugins() {
    return [
      new Plugin<FoldState>({
        key: codeFoldKey,
        state: {
          init: (_, { doc }) => ({ ...build(doc, new Set(), new Set()) }),
          apply: (tr, value) => {
            const meta = tr.getMeta(codeFoldKey) as FoldMeta | undefined;
            if (!meta && !tr.docChanged) return value;
            let folded = tr.docChanged ? mapSet(value.folded, tr.mapping, -1) : value.folded;
            let collapsed = tr.docChanged ? mapSet(value.collapsed, tr.mapping, 1) : value.collapsed;
            if (meta) {
              const toggle = (set: Set<number>, pos: number) => {
                const next = new Set(set);
                if (!next.delete(pos)) next.add(pos);
                return next;
              };
              if ("fold" in meta) folded = toggle(folded, meta.fold);
              else collapsed = toggle(collapsed, meta.collapse);
            }
            return build(tr.doc, folded, collapsed);
          },
        },
        props: {
          decorations: (state) => codeFoldKey.getState(state)?.decorations,
        },
        // Never leave the caret inside hidden text: park it where the fold begins.
        appendTransaction: (_trs, _old, state) => {
          const hidden = codeFoldKey.getState(state)?.hidden;
          if (!hidden?.length) return null;
          const { from } = state.selection;
          const range = hidden.find(([start, end]) => from > start && from <= end);
          return range ? state.tr.setSelection(TextSelection.near(state.doc.resolve(range[0]), -1)) : null;
        },
      }),
    ];
  },
});
