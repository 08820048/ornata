import { InputRule } from "@tiptap/core";
import type { NodeViewRendererProps } from "@tiptap/core";
import {
  BlockMath as BaseBlockMath,
  InlineMath as BaseInlineMath,
} from "@tiptap/extension-mathematics";
import katex from "katex";

export const INLINE_MATH_INPUT_RE =
  /(?<![\\$])\$(?!\$)([^$\n]+?)\$(?!\$)$/;
export const BLOCK_MATH_INPUT_RE = /^\$\$(?!\$)([^$\n]+?)\$\$$/;

/**
 * In-place math editing: clicking a rendered formula swaps its NodeView to a
 * LaTeX source field (Enter or blur commits, Escape cancels). Both extensions
 * share this view; only the wrapper tag and katex display mode differ.
 */
function createMathView(tag: "span" | "div", displayMode: boolean) {
  return ({ node, getPos, editor }: NodeViewRendererProps) => {
    const wrapper = document.createElement(tag);
    wrapper.className = "tiptap-mathematics-render math-editable";
    wrapper.dataset.type = displayMode ? "block-math" : "inline-math";
    wrapper.setAttribute("data-latex", node.attrs.latex);

    const render = document.createElement(displayMode ? "div" : "span");
    render.className = displayMode ? "block-math-inner" : "inline-math-inner";
    wrapper.appendChild(render);

    const input = document.createElement("textarea");
    input.className = "math-source-editor";
    input.spellcheck = false;
    input.rows = displayMode ? 3 : 1;
    input.value = node.attrs.latex;
    input.hidden = true;

    let editing = false;

    const drawFormula = () => {
      try {
        katex.render(node.attrs.latex, render, {
          displayMode,
          errorColor: "currentColor",
          throwOnError: false,
          trust: false,
        });
        wrapper.classList.remove(
          displayMode ? "block-math-error" : "inline-math-error",
        );
      } catch {
        render.textContent = node.attrs.latex;
        wrapper.classList.add(
          displayMode ? "block-math-error" : "inline-math-error",
        );
      }
    };

    const showSource = () => {
      input.hidden = false;
      render.hidden = true;
      wrapper.classList.add("math-editing");
    };

    const showFormula = () => {
      input.hidden = true;
      render.hidden = false;
      wrapper.classList.remove("math-editing");
    };

    const commit = () => {
      if (!editing) return;
      editing = false;
      const latex = input.value.trim();
      const pos = getPos();
      if (pos != null) {
        editor
          .chain()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { latex });
            return true;
          })
          .run();
      }
      showFormula();
      drawFormula();
    };

    const cancel = () => {
      if (!editing) return;
      editing = false;
      input.value = node.attrs.latex;
      showFormula();
      drawFormula();
    };

    const startEdit = () => {
      if (editing || !editor.isEditable) return;
      editing = true;
      input.value = node.attrs.latex;
      showSource();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };

    wrapper.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startEdit();
    });

    input.addEventListener("keydown", (event) => {
      // While editing, the field owns the keyboard — stop every key from
      // reaching ProseMirror. Otherwise Backspace/Delete hit the node
      // selection left by the click and wipe the whole formula, and arrows
      // move the selection onto the next block (e.g. a rule below it).
      event.stopPropagation();
      if (event.key === "Enter" && (displayMode || !event.shiftKey)) {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
    // Commit on blur — clicking elsewhere accepts the edit rather than
    // discarding it (matches how code blocks and inputs behave).
    input.addEventListener("blur", commit);
    // Stop the editor's global handlers from swallowing clicks inside the field.
    input.addEventListener("mousedown", (event) => event.stopPropagation());

    drawFormula();
    wrapper.appendChild(input);
    if (!node.attrs.latex) startEdit();
    return {
      dom: wrapper,
      update: (nextNode: typeof node) => {
        node = nextNode;
        if (!editing) drawFormula();
        return true;
      },
      ignoreMutation: () => true,
      destroy: () => {
        wrapper.replaceChildren();
      },
    };
  };
}

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
  addNodeView() {
    return createMathView("span", false);
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
  addNodeView() {
    return createMathView("div", true);
  },
}).configure({
  katexOptions: {
    displayMode: true,
    errorColor: "currentColor",
    throwOnError: false,
    trust: false,
  },
});
