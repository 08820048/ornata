import { Extension, InputRule } from "@tiptap/core";
import { noteLinkParts, resolveWiki, splitWikiTarget } from "@/lib/noteLinks";
import { flattenNotes } from "@/lib/tree";
import { useVault } from "@/stores/vault";

/**
 * Turns `[[target]]` / `[[target|alias]]` into an internal page link the moment
 * the closing `]]` is typed. The target resolves against the current vault, and
 * the result is a normal link mark (serializes to `[alias](target.md)`), so the
 * file stays plain markdown — `[[ ]]` is only an input shortcut.
 */
export const WikiLink = Extension.create({
  name: "wikiLink",

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]$/,
        handler: ({ state, range, match, chain }) => {
          const linkType = state.schema.marks.link;
          if (!linkType) return;
          const notes = flattenNotes(useVault.getState().tree);
          // `[[笔记#标题]]` links a heading: split the fragment off before
          // resolving, then encode it back onto the href.
          const { target: noteTarget, heading } = splitWikiTarget(match[1]);
          const { rel, title } = resolveWiki(noteTarget, notes);
          const { text, href } = noteLinkParts(rel, title, heading);
          chain()
            .deleteRange(range)
            .insertContent([
              {
                type: "text",
                text: (match[2] ?? text).trim(),
                marks: [{ type: "link", attrs: { href } }],
              },
              { type: "text", text: " " },
            ])
            .run();
        },
      }),
    ];
  },
});
