import type { Editor } from "@tiptap/react";
import { hrefToRel, relToHref, type LinkRewrite } from "@/lib/noteLinks";

/**
 * Repoint link marks in a live Tiptap editor after the backend rewrote the
 * file on disk (rename/move). Runs a single transaction so the change joins
 * undo history and the autosave pipeline naturally.
 */
export function applyLinkRewritesToEditor(editor: Editor, rewrites: LinkRewrite[]) {
  const { state } = editor.view;
  const markType = state.schema.marks.link;
  if (!markType || editor.isDestroyed) return;

  const map = new Map(
    rewrites.map(({ from, to }) => [from.toLowerCase(), relToHref(to)]),
  );
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type !== markType) continue;
      const rel = hrefToRel(mark.attrs.href as string | null);
      if (!rel) continue;
      const href = map.get(rel.toLowerCase());
      if (!href || href === mark.attrs.href) continue;
      tr.removeMark(pos, pos + node.nodeSize, markType);
      tr.addMark(pos, pos + node.nodeSize, markType.create({
        ...mark.attrs,
        href,
        decodedHref: hrefToRel(href),
      }));
    }
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}
