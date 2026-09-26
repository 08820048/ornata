import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { hrefToRel } from "@/lib/noteLinks";

/**
 * Flags internal links whose target rel isn't in the vault tree. The set of
 * known rels arrives via plugin meta (dispatched from NoteEditor whenever the
 * tree changes); decorations rebuild on doc changes with the current set.
 */
export const brokenLinksKey = new PluginKey<BrokenState>("brokenLinks");

interface BrokenState {
  rels: Set<string>;
  decorations: DecorationSet;
}

function rebuild(doc: ProseMirrorNode, rels: Set<string>): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    collectBroken(node, pos, rels, decorations);
  });
  return DecorationSet.create(doc, decorations);
}

function collectBroken(
  node: ProseMirrorNode,
  pos: number,
  rels: Set<string>,
  out: Decoration[],
) {
  if (!node.isText || !node.marks.length) return;
  for (const mark of node.marks) {
    if (mark.type.name !== "link") continue;
    const rel = hrefToRel(mark.attrs.href as string | null);
    if (rel && !rels.has(rel.toLowerCase())) {
      out.push(
        Decoration.inline(pos, pos + node.nodeSize, { class: "link-broken" }),
      );
    }
  }
}

export const BrokenLinks = Extension.create({
  name: "brokenLinks",
  addProseMirrorPlugins() {
    return [
      new Plugin<BrokenState>({
        key: brokenLinksKey,
        state: {
          init: () => ({
            rels: new Set<string>(),
            decorations: DecorationSet.empty,
          }),
          apply: (tr: Transaction, value: BrokenState) => {
            const meta = tr.getMeta(brokenLinksKey) as Set<string> | undefined;
            if (meta) return { rels: meta, decorations: rebuild(tr.doc, meta) };
            if (!tr.docChanged) return value;
            return {
              rels: value.rels,
              decorations: rebuild(tr.doc, value.rels),
            };
          },
        },
        props: {
          decorations: (state: EditorState) =>
            brokenLinksKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
