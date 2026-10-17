import { Extension, InputRule } from "@tiptap/core";

/**
 * `* ` at the start of a paragraph becomes a to-do item (Thymer-style),
 * instead of the bullet StarterKit would make. `- ` and `+ ` still make
 * bullets. Inside any list the rule stands aside, so existing list editing
 * behaves as before. Backspace right after reverts it, like any input rule.
 */
export const StarTask = Extension.create({
  name: "starTask",
  // Must run ahead of the bullet list's own `* ` rule.
  priority: 1000,
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*\*\s$/,
        handler: ({ range, chain }) => {
          const { editor } = this;
          if (
            editor.isActive("bulletList") ||
            editor.isActive("orderedList") ||
            editor.isActive("taskList") ||
            editor.isActive("codeBlock")
          ) {
            return null;
          }
          chain().deleteRange(range).toggleTaskList().run();
        },
      }),
    ];
  },
});
