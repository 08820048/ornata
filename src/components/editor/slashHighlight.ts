import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Marks the `/…` or `@…` text that drives the open slash menu with a small
 * rounded background. The range arrives via plugin meta (`null` clears it) and
 * is mapped through edits in between.
 */
export const slashHighlightKey = new PluginKey<Range | null>("slashHighlight");

type Range = { from: number; to: number };

export const SlashHighlight = Extension.create({
  name: "slashHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<Range | null>({
        key: slashHighlightKey,
        state: {
          init: () => null,
          apply: (tr: Transaction, value: Range | null) => {
            const meta = tr.getMeta(slashHighlightKey) as
              | { range: Range | null }
              | undefined;
            if (meta) return meta.range;
            if (!value || !tr.docChanged) return value;
            return { from: tr.mapping.map(value.from, -1), to: tr.mapping.map(value.to) };
          },
        },
        props: {
          decorations: (state: EditorState) => {
            const range = slashHighlightKey.getState(state);
            if (!range || range.to <= range.from || range.to > state.doc.content.size) {
              return null;
            }
            return DecorationSet.create(state.doc, [
              Decoration.inline(range.from, range.to, { class: "slash-trigger" }),
            ]);
          },
        },
      }),
    ];
  },
});
