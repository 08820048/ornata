import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** A top-level block: heading `level`, or null for anything else. */
export interface FoldBlock {
  pos: number;
  size: number;
  level: number | null;
}

/**
 * Ranges hidden by folding: everything after a folded heading up to the next
 * heading of the same or a higher level (or the end of the note).
 */
export function hiddenRanges(
  blocks: FoldBlock[],
  folded: ReadonlySet<number>,
): Array<{ heading: number; from: number; to: number }> {
  const ranges: Array<{ heading: number; from: number; to: number }> = [];
  let covered = -1;
  blocks.forEach((block, i) => {
    if (block.level === null || !folded.has(block.pos)) return;
    if (block.pos < covered) return; // already hidden by an outer fold
    const from = block.pos + block.size;
    let to = from;
    for (let j = i + 1; j < blocks.length; j += 1) {
      const next = blocks[j];
      if (next.level !== null && next.level <= block.level) break;
      to = next.pos + next.size;
    }
    if (to > from) {
      ranges.push({ heading: block.pos, from, to });
      covered = to;
    }
  });
  return ranges;
}

export const headingFoldKey = new PluginKey<FoldState>("headingFold");

interface FoldState {
  /** Positions of folded headings, mapped through every edit. */
  folded: Set<number>;
  decorations: DecorationSet;
}

function topLevelBlocks(doc: ProseMirrorNode): FoldBlock[] {
  const blocks: FoldBlock[] = [];
  doc.forEach((node, pos) => {
    blocks.push({
      pos,
      size: node.nodeSize,
      level: node.type.name === "heading" ? (node.attrs.level as number) : null,
    });
  });
  return blocks;
}

function build(doc: ProseMirrorNode, folded: Set<number>): DecorationSet {
  const blocks = topLevelBlocks(doc);
  const decorations: Decoration[] = [];
  for (const block of blocks) {
    if (block.level === null) continue;
    const isFolded = folded.has(block.pos);
    if (isFolded) {
      decorations.push(
        Decoration.node(block.pos, block.pos + block.size, { class: "heading-folded" }),
      );
    }
    decorations.push(
      Decoration.widget(
        block.pos + 1,
        // No position in the key: typing above reuses this DOM, so the click
        // reads the widget's current position (it sits just inside the heading).
        (view, getPos) => {
          const el = document.createElement("span");
          el.className = "heading-fold";
          el.contentEditable = "false";
          el.setAttribute("role", "button");
          el.setAttribute("aria-expanded", String(!isFolded));
          el.addEventListener("mousedown", (event) => {
            event.preventDefault();
            const at = getPos();
            if (typeof at === "number") view.dispatch(view.state.tr.setMeta(headingFoldKey, { toggle: at - 1 }));
          });
          return el;
        },
        { side: -1, key: `heading-fold-${isFolded}`, ignoreSelection: true },
      ),
    );
  }
  for (const range of hiddenRanges(blocks, folded)) {
    doc.nodesBetween(range.from, range.to, (node, pos) => {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "fold-hidden" }));
      return false;
    });
  }
  return DecorationSet.create(doc, decorations);
}

function mapFolded(tr: Transaction, folded: Set<number>): Set<number> {
  const next = new Set<number>();
  for (const pos of folded) {
    const result = tr.mapping.mapResult(pos, 1);
    if (result.deleted) continue;
    if (tr.doc.nodeAt(result.pos)?.type.name === "heading") next.add(result.pos);
  }
  return next;
}

/** ▸ chevron on every heading; click folds its section. View-only state. */
export const HeadingFold = Extension.create({
  name: "headingFold",
  addProseMirrorPlugins() {
    return [
      new Plugin<FoldState>({
        key: headingFoldKey,
        state: {
          init: (_, { doc }) => ({ folded: new Set(), decorations: build(doc, new Set()) }),
          apply: (tr, value) => {
            const toggle = (tr.getMeta(headingFoldKey) as { toggle: number } | undefined)?.toggle;
            if (toggle === undefined && !tr.docChanged) return value;
            let folded = tr.docChanged ? mapFolded(tr, value.folded) : value.folded;
            if (toggle !== undefined) {
              folded = new Set(folded);
              if (!folded.delete(toggle)) folded.add(toggle);
            }
            return { folded, decorations: build(tr.doc, folded) };
          },
        },
        props: {
          decorations: (state) => headingFoldKey.getState(state)?.decorations,
        },
        // Never leave the caret inside hidden text: park it on the heading.
        appendTransaction: (_trs, _old, state) => {
          const folded = headingFoldKey.getState(state)?.folded;
          if (!folded?.size) return null;
          const { from } = state.selection;
          const range = hiddenRanges(topLevelBlocks(state.doc), folded).find(
            (r) => from >= r.from && from <= r.to,
          );
          if (!range) return null;
          return state.tr.setSelection(TextSelection.near(state.doc.resolve(range.from - 1), -1));
        },
      }),
    ];
  },
});
