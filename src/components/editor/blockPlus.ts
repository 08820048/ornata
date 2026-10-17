import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const blockPlusKey = new PluginKey("blockPlus");

/**
 * A "+" in the left gutter of an empty line, shown while the caret is on it or
 * the pointer is over it. Clicking types a "/" there, which opens the same
 * suggestion menu as typing it yourself — one menu, two ways in.
 */
export const BlockPlus = Extension.create({
  name: "blockPlus",
  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: blockPlusKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const caret = state.selection.empty ? state.selection.from : -1;
            state.doc.forEach((node, pos) => {
              if (node.type.name !== "paragraph" || node.content.size > 0) return;
              const hasCaret = caret === pos + 1;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: hasCaret ? "empty-line has-caret" : "empty-line",
                }),
                Decoration.widget(
                  pos + 1,
                  (view, getPos) => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "block-plus";
                    button.contentEditable = "false";
                    button.setAttribute("aria-label", "Insert");
                    button.textContent = "+";
                    // Keep the editor's focus and selection while clicking.
                    button.addEventListener("mousedown", (event) => {
                      event.preventDefault();
                      const at = getPos();
                      if (typeof at !== "number" || !view.editable) return;
                      editor.chain().focus().insertContentAt(at, "/").run();
                    });
                    return button;
                  },
                  { side: -1, key: `block-plus-${pos}`, ignoreSelection: true },
                ),
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
