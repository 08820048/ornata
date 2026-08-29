import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { EASE_OUT_CSS } from "@/lib/ease";

export function textEditBetween(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
) {
  const from = before.content.findDiffStart(after.content);
  if (from === null) return null;
  const end = before.content.findDiffEnd(after.content);
  if (!end) return null;
  if (end.a - from > 16 || end.b - from > 16) return null;

  const removed = end.a > from ? before.textBetween(from, end.a, "\n") : "";
  const added = end.b > from ? after.textBetween(from, end.b, "\n") : "";
  return added === removed ? null : { from, added, removed };
}

export function isTrailable(text: string) {
  return Boolean(text.trim()) && !text.includes("\n") && [...text].length <= 8;
}

let reducedMotion: MediaQueryList | null = null;

function prefersReducedMotion() {
  if (!reducedMotion) {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return reducedMotion.matches;
}

export function showTextEditTrail(
  view: EditorView,
  transaction: Transaction,
) {
  if (!transaction.docChanged || view.composing || prefersReducedMotion()) {
    return;
  }

  const edit = textEditBetween(transaction.before, transaction.doc);
  if (!edit) return;
  const trails = [
    { text: edit.added, added: true },
    { text: edit.removed, added: false },
  ].filter(({ text }) => isTrailable(text));
  if (trails.length === 0) return;
  const position = edit.from;

  // Coordinates must be read once the editor DOM settles — reading them
  // synchronously would force layout on every keystroke. Edits may land
  // within that frame, so a stale position skips the ghost.
  requestAnimationFrame(() => {
    if (view.isDestroyed || !view.dom.isConnected) return;
    if (position > view.state.doc.content.size) return;
    const coords = view.coordsAtPos(position);
    const node = view.domAtPos(position).node;
    const source = node instanceof Element ? node : (node.parentElement ?? view.dom);
    const computed = window.getComputedStyle(source);

    trails.forEach(({ text, added }) => {
      const ghost = document.createElement("span");
      ghost.textContent = text;
      Object.assign(ghost.style, {
        position: "fixed",
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        zIndex: "80",
        pointerEvents: "none",
        userSelect: "none",
        whiteSpace: "pre",
        color: computed.color,
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontStyle: computed.fontStyle,
        fontWeight: computed.fontWeight,
        letterSpacing: computed.letterSpacing,
        lineHeight: `${coords.bottom - coords.top}px`,
      });
      document.body.appendChild(ghost);

      const animation = ghost.animate(
        added
          ? [
              { opacity: 0.28, transform: "translate3d(-3px, 0, 0)", filter: "blur(0px)" },
              { opacity: 0, transform: "translate3d(-10px, 0, 0)", filter: "blur(2px)" },
            ]
          : [
              { opacity: 0.45, transform: "translate3d(0, 0, 0)", filter: "blur(0px)" },
              { opacity: 0, transform: "translate3d(-6px, -4px, 0)", filter: "blur(2px)" },
            ],
        { duration: added ? 160 : 140, easing: EASE_OUT_CSS, fill: "forwards" },
      );
      animation.onfinish = animation.oncancel = () => ghost.remove();
    });
  });
}
