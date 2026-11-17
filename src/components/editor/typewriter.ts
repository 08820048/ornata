import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/**
 * Typewriter scrolling, for focus mode: the line being written stays at the
 * middle of the pane and every other block is dimmed.
 *
 * The plugin's state is just "on or off", switched from React with
 * `setTypewriter` (focus mode and the setting live outside the editor). The
 * block under the caret gets `tw-current` (and its list item
 * `tw-current-item`); the dimming itself is CSS on everything without it.
 */
export const typewriterKey = new PluginKey<boolean>("typewriter");

const LIST_ITEMS = new Set(["listItem", "taskItem"]);
const SCROLL_MS = 140;

export function setTypewriter(view: EditorView, on: boolean) {
  if (typewriterKey.getState(view.state) === on) return;
  view.dispatch(view.state.tr.setMeta(typewriterKey, on));
}

export interface CurrentBlocks {
  /** The top-level block holding the caret. */
  block: { from: number; to: number } | null;
  /** The innermost list item holding it, if it is in a list. */
  item: { from: number; to: number } | null;
}

export function currentBlocks(state: EditorState): CurrentBlocks {
  const { $head } = state.selection;
  if ($head.depth === 0) {
    // A selected top-level leaf (image, rule): the node right after the pos.
    const node = state.selection.$from.nodeAfter;
    const from = state.selection.from;
    return { block: node ? { from, to: from + node.nodeSize } : null, item: null };
  }
  const span = (depth: number) => ({ from: $head.before(depth), to: $head.after(depth) });
  let item: CurrentBlocks["item"] = null;
  for (let depth = $head.depth; depth > 1 && !item; depth--) {
    if (LIST_ITEMS.has($head.node(depth).type.name)) item = span(depth);
  }
  return { block: span(1), item };
}

export function typewriterDecorations(state: EditorState): DecorationSet {
  const { block, item } = currentBlocks(state);
  const decorations: Decoration[] = [];
  if (block) decorations.push(Decoration.node(block.from, block.to, { class: "tw-current" }));
  if (item) decorations.push(Decoration.node(item.from, item.to, { class: "tw-current-item" }));
  return DecorationSet.create(state.doc, decorations);
}

/** The scrollTop that puts the caret's middle at the middle of the scroller. */
export function centeredScrollTop(
  caret: { top: number; bottom: number },
  scroller: { top: number; height: number; scrollTop: number },
): number {
  const caretMiddle = (caret.top + caret.bottom) / 2;
  const middle = scroller.top + scroller.height / 2;
  return Math.max(0, Math.round(scroller.scrollTop + caretMiddle - middle));
}

class TypewriterView {
  private frame = 0;

  constructor(
    private view: EditorView,
    private typing: () => boolean,
  ) {}

  update(view: EditorView, prev: EditorState) {
    this.view = view;
    const on = typewriterKey.getState(view.state);
    if (!on) return;
    const turnedOn = !typewriterKey.getState(prev);
    const moved = !prev.selection.eq(view.state.selection) || !prev.doc.eq(view.state.doc);
    // A click or a drag must not pull the text out from under the pointer:
    // only typing and keyboard movement re-centre.
    if (turnedOn || (moved && this.typing())) this.center();
  }

  private center() {
    const root = this.view.dom.closest<HTMLElement>(".page-scroll");
    if (!root) return;
    let caret: { top: number; bottom: number };
    try {
      caret = this.view.coordsAtPos(this.view.state.selection.head);
    } catch {
      return;
    }
    const box = root.getBoundingClientRect();
    const from = root.scrollTop;
    const to = centeredScrollTop(caret, { top: box.top, height: box.height, scrollTop: from });
    cancelAnimationFrame(this.frame);
    if (Math.abs(to - from) < 2) return;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / SCROLL_MS);
      root.scrollTop = from + (to - from) * (1 - (1 - t) ** 3);
      if (t < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
  }
}

export const Typewriter = Extension.create({
  name: "typewriter",

  addProseMirrorPlugins() {
    let typing = false;
    return [
      new Plugin<boolean>({
        key: typewriterKey,
        state: {
          init: () => false,
          apply: (tr, on) => {
            const next = tr.getMeta(typewriterKey);
            return typeof next === "boolean" ? next : on;
          },
        },
        props: {
          decorations: (state) =>
            typewriterKey.getState(state) ? typewriterDecorations(state) : null,
          handleDOMEvents: {
            keydown: () => {
              typing = true;
              return false;
            },
            mousedown: () => {
              typing = false;
              return false;
            },
          },
        },
        view: (view) => new TypewriterView(view, () => typing),
      }),
    ];
  },
});
