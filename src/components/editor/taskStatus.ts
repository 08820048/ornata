import { Extension, InputRule, type Editor } from "@tiptap/core";
import TaskItem from "@tiptap/extension-task-item";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { stampNow } from "@/lib/stamps";
import TaskList from "@tiptap/extension-task-list";

/**
 * Task boxes beyond done / not done: `[/]` in progress, `[-]` canceled (the
 * project space's issue statuses). `checked` stays the done flag; `status` is
 * `"doing" | "canceled" | null` and only applies while unchecked. Any click on
 * the box clears it, like ticking an ordinary task.
 *
 * The stock list tokenizer only knows `[ xX]`, so the markers are swapped for
 * a private-use sentinel before it runs and read back in `parseMarkdown`.
 */
const SENTINEL = "\uE000";
const MARKER = /^(\s*[-+*]\s+)\[([/-])\](\s)/gm;
const CODE: Record<string, string> = { "/": "d", "-": "c" };
const STATUS: Record<string, string> = { d: "doing", c: "canceled" };
const MARK: Record<string, string> = { doing: "/", canceled: "-" };

type Tokenizer = {
  name: string;
  level: "block";
  start: (src: string) => number;
  tokenize: (src: string, tokens: unknown[], lexer: unknown) => { raw: string } | undefined;
};

const base = (TaskList.config as unknown as { markdownTokenizer: Tokenizer }).markdownTokenizer;

const STAMP = "\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2})?";
const CLOSING = new RegExp(`(?:^|\\s)[✓✗]${STAMP}(?=\\s|$)`, "g");
const ANY_STAMP = new RegExp(`[◷✓✗]${STAMP}`, "g");

/**
 * Keep the item's closing time in step with its box: ticking adds `✓time`,
 * canceling adds `✗time`, anything else removes it, like the project views and
 * agents do. The stamp is ordinary text at the end of the item's first line.
 */
function restampItem(tr: Transaction, at: number, closing: "✓" | "✗" | null, spaced = false) {
  const item = tr.doc.nodeAt(at);
  const line = item?.firstChild;
  if (!item || !line || line.type.name !== "paragraph") return;
  const start = at + 2;
  const ranges: Array<[number, number]> = [];
  line.descendants((child, offset) => {
    if (!child.isText || !child.text) return;
    for (const m of child.text.matchAll(CLOSING)) {
      const from = start + offset + (m.index ?? 0);
      ranges.push([from, from + m[0].length]);
    }
  });
  let end = start + line.content.size;
  for (const [from, to] of ranges.reverse()) {
    tr.delete(from, to);
    end -= to - from;
  }
  if (closing) tr.insert(end, tr.doc.type.schema.text(`${end > start || spaced ? " " : ""}${closing}${stampNow()}`));
}

/** Dim the `◷` `✓` `✗` times in task lines: they are the app's bookkeeping, not prose. */
function stampDecorations(doc: PMNode) {
  const found: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.name === "paragraph" && parent?.type.name !== "taskItem") return false;
    if (!node.isText || !node.text) return;
    for (const m of node.text.matchAll(ANY_STAMP)) {
      const from = pos + (m.index ?? 0);
      found.push(Decoration.inline(from, from + m[0].length, { class: "task-stamp" }));
    }
  });
  return DecorationSet.create(doc, found);
}

export const TaskListStatus = TaskList.extend({
  markdownTokenizer: {
    ...base,
    start: (src: string) => base.start(src.replace(MARKER, `$1[ ]$3`)),
    tokenize: (src: string, tokens: unknown[], lexer: unknown) => {
      const marked = src.replace(MARKER, (_, lead, mark, space) => `${lead}[ ]${space}${SENTINEL}${CODE[mark]}`);
      const result = base.tokenize(marked, tokens, lexer);
      // The lexer advances by `raw`, so it must be as long as the text written.
      return result && { ...result, raw: result.raw.replace(new RegExp(`${SENTINEL}[dc]`, "g"), "") };
    },
  },
});

export const TaskItemStatus = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      status: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-status"),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.status ? { "data-status": attrs.status } : {}),
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        state: {
          init: (_, { doc }) => stampDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? stampDecorations(tr.doc) : old),
        },
        props: { decorations(state) { return this.getState(state); } },
      }),
    ];
  },

  parseMarkdown(token, h) {
    const code = new RegExp(`^${SENTINEL}([dc])`).exec(token.text ?? "")?.[1];
    const base = TaskItem.config.parseMarkdown!.bind(this);
    if (!code) return base(token, h);
    const strip = (s: string) => s.slice(2);
    const tokens = token.tokens ? [...token.tokens] : [];
    if (tokens[0]?.text?.startsWith(SENTINEL)) tokens[0] = { ...tokens[0], text: strip(tokens[0].text ?? ""), raw: strip(tokens[0].raw ?? tokens[0].text ?? "") };
    const node = base({ ...token, text: strip(token.text ?? ""), tokens }, h);
    return !Array.isArray(node) && "type" in node ? { ...node, attrs: { ...node.attrs, status: STATUS[code] } } : node;
  },

  renderMarkdown(node, h) {
    const mark = node.attrs?.checked ? "x" : (MARK[node.attrs?.status] ?? " ");
    return (TaskItem.config.renderMarkdown as (n: unknown, h: unknown) => string).call(
      this,
      { ...node, attrs: { ...node.attrs, checked: false } },
      h,
    ).replace(/^(\s*- )\[ \]/, `$1[${mark}]`);
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const box = document.createElement("span");
      const input = document.createElement("input");
      const content = document.createElement("div");
      label.contentEditable = "false";
      input.type = "checkbox";
      input.addEventListener("mousedown", (event) => event.preventDefault());
      input.addEventListener("change", () => {
        if (!editor.isEditable || typeof getPos !== "function") {
          input.checked = !input.checked;
          return;
        }
        const checked = input.checked;
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .command(({ tr }) => {
            const at = getPos();
            if (typeof at !== "number") return false;
            tr.setNodeMarkup(at, undefined, { ...tr.doc.nodeAt(at)?.attrs, checked, status: null });
            restampItem(tr, at, checked ? "✓" : null);
            return true;
          })
          .run();
      });
      const apply = (n: typeof node) => {
        li.dataset.checked = String(n.attrs.checked);
        if (n.attrs.status) li.dataset.status = n.attrs.status;
        else delete li.dataset.status;
        input.checked = n.attrs.checked;
        input.ariaLabel = n.textContent || "Task item";
      };
      apply(node);
      label.append(input, box);
      li.append(label, content);
      return {
        dom: li,
        contentDOM: content,
        update: (next) => {
          if (next.type !== node.type) return false;
          apply(next);
          return true;
        },
      };
    };
  },
});

/**
 * Give the task item the caret is in `status` (never done), and its closing
 * time to match: canceling stamps `✗`, in progress clears any `✓` / `✗`.
 */
function applyStatus(status: "doing" | "canceled") {
  return ({ tr }: { tr: Transaction }) => {
    const { $from } = tr.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name !== "taskItem") continue;
      const at = $from.before(depth);
      tr.setNodeMarkup(at, undefined, { ...$from.node(depth).attrs, status, checked: false });
      // The caret stays in front of the stamp, so what is typed next lands before it (the stamp starts with a space).
      const caret = tr.selection.from;
      const steps = tr.steps.length;
      restampItem(tr, at, status === "canceled" ? "✗" : null, true);
      tr.setSelection(TextSelection.create(tr.doc, tr.mapping.slice(steps).map(caret, -1)));
      return true;
    }
    return false;
  };
}

/** Make the paragraph the caret is in a task with `status` (the slash menu's "in progress" / "canceled"). */
export function setTaskStatus(editor: Editor, status: "doing" | "canceled") {
  const chain = editor.chain().focus();
  if (!editor.isActive("taskItem")) chain.toggleTaskList();
  return chain.command(applyStatus(status)).run();
}

/**
 * `[/] ` and `[-] ` at the start of a line make an in-progress / canceled
 * task, the way `[ ] ` and `* ` make a plain one. On a line that is already a
 * task the box just changes.
 */
export const TaskStatusInput = Extension.create({
  name: "taskStatusInput",
  priority: 1000,
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*\[([/-])\]\s$/,
        handler: ({ range, match, chain }) => {
          const { editor } = this;
          if (editor.isActive("codeBlock")) return null;
          const status = match[1] === "/" ? "doing" : "canceled";
          const c = chain().deleteRange(range);
          if (!editor.isActive("taskItem")) c.toggleTaskList();
          c.command(applyStatus(status)).run();
        },
      }),
    ];
  },
});
