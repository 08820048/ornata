import { InputRule } from "@tiptap/core";
import {
  BlockMath as BaseBlockMath,
  InlineMath as BaseInlineMath,
} from "@tiptap/extension-mathematics";

export const INLINE_MATH_INPUT_RE =
  /(?<![\\$])\$(?!\$)([^$\n]+?)\$(?!\$)$/;
export const BLOCK_MATH_INPUT_RE = /^\$\$(?!\$)([^$\n]+?)\$\$$/;

export const MathInline = BaseInlineMath.extend({
  addInputRules() {
    return [
      new InputRule({
        find: INLINE_MATH_INPUT_RE,
        handler: ({ state, range, match }) => {
          const latex = match[1].trim();
          if (!latex) return;
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ latex }),
          );
        },
      }),
    ];
  },
}).configure({
  katexOptions: {
    displayMode: false,
    errorColor: "currentColor",
    throwOnError: false,
    trust: false,
  },
});

export const MathBlock = BaseBlockMath.extend({
  addInputRules() {
    return [
      new InputRule({
        find: BLOCK_MATH_INPUT_RE,
        handler: ({ state, range, match }) => {
          const latex = match[1].trim();
          if (!latex) return;

          const { tr } = state;
          const $from = state.doc.resolve(range.from);
          const consumesParagraph =
            $from.depth > 0 &&
            $from.parent.isTextblock &&
            range.from === $from.start() &&
            range.to === $from.end();
          const canReplaceParagraph =
            consumesParagraph &&
            $from
              .node(-1)
              .canReplaceWith(
                $from.index(-1),
                $from.indexAfter(-1),
                this.type,
              );
          if (!canReplaceParagraph) return;

          tr.replaceWith(
            $from.before(),
            $from.after(),
            this.type.create({ latex }),
          );
        },
      }),
    ];
  },
}).configure({
  katexOptions: {
    displayMode: true,
    errorColor: "currentColor",
    throwOnError: false,
    trust: false,
  },
});
