import TaskItem from "@tiptap/extension-task-item";
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
