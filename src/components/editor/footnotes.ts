import { Extension, type Editor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/** A `[^id]` in running text. */
export interface FootnoteRef {
  id: string;
  from: number;
  to: number;
}

/** A `[^id]: text` line. `from`–`to` is the marker (with its colon and space). */
export interface FootnoteDef {
  id: string;
  from: number;
  to: number;
  /** The rest of the line, as plain text. */
  text: string;
}

export interface Footnotes {
  refs: FootnoteRef[];
  defs: FootnoteDef[];
  /** Display number by id: order of first reference, then unreferenced definitions. */
  numbers: Map<string, number>;
}

const REF = /\[\^([^\]\s^]+)\]/g;
const DEF = /^\[\^([^\]\s^]+)\]:[ \t]?/;

/**
 * Find footnote references and definitions. They stay ordinary text in the
 * document — the Markdown is saved exactly as typed — so this reads them out
 * of text nodes: a definition opens a line (the start of a paragraph, or after
 * a line break), everything else is a reference. Code is skipped.
 */
export function scanFootnotes(doc: PmNode): Footnotes {
  const refs: FootnoteRef[] = [];
  const defs: FootnoteDef[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return;
    if (block.type.spec.code) return false;
    let offset = blockPos + 1;
    let lineStart = true;
    block.forEach((child, _, index) => {
      const at = offset;
      offset += child.nodeSize;
      if (child.type.name === "hardBreak") {
        lineStart = true;
        return;
      }
      const opensLine = lineStart;
      lineStart = false;
      if (!child.isText || child.marks.some((mark) => mark.type.spec.code)) return;
      const text = child.text ?? "";
      let skip = 0;
      const def = opensLine ? DEF.exec(text) : null;
      if (def) {
        let rest = text.slice(def[0].length);
        for (let next = index + 1; next < block.childCount; next += 1) {
          const sibling = block.child(next);
          if (sibling.type.name === "hardBreak") break;
          rest += sibling.textContent;
        }
        defs.push({ id: def[1], from: at, to: at + def[0].length, text: rest.trim() });
        skip = def[0].length;
      }
      REF.lastIndex = skip;
      for (let match = REF.exec(text); match; match = REF.exec(text)) {
        refs.push({ id: match[1], from: at + match.index, to: at + match.index + match[0].length });
      }
    });
    return false;
  });
  const numbers = new Map<string, number>();
  for (const { id } of [...refs, ...defs]) {
    if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
  }
  return { refs, defs, numbers };
}

/** The lowest number not yet used as a footnote id. */
export function nextFootnoteId(notes: Footnotes): string {
  const used = new Set([...notes.refs, ...notes.defs].map((note) => note.id));
  let n = 1;
  while (used.has(String(n))) n += 1;
  return String(n);
}

/**
 * Insert a reference at the caret and its definition as a new last line of
 * the note, leaving the caret there to type the footnote.
 */
export function insertFootnote(editor: Editor) {
  const id = nextFootnoteId(scanFootnotes(editor.state.doc));
  return editor
    .chain()
    .focus()
    .insertContent(`[^${id}]`)
    .command(({ tr, state, dispatch }) => {
      if (!dispatch) return true;
      const paragraph = state.schema.nodes.paragraph.create(null, state.schema.text(`[^${id}]: `));
      const end = tr.doc.content.size;
      tr.insert(end, paragraph);
      tr.setSelection(TextSelection.atEnd(tr.doc)).scrollIntoView();
      return true;
    })
    .run();
}

export const footnotesKey = new PluginKey<Footnotes>("footnotes");

function badge(className: string, label: string, id: string) {
  const element = document.createElement(className === "footnote-num" ? "sup" : "span");
  element.className = className;
  element.contentEditable = "false";
  element.dataset.footnote = id;
  element.textContent = label;
  return element;
}

/** Numbers in place of the typed markers; a marker shows as typed while the caret is in it. */
export function footnoteDecorations(state: EditorState, notes: Footnotes): DecorationSet {
  const { from, to } = state.selection;
  const decorations: Decoration[] = [];
  const dress = (note: FootnoteRef | FootnoteDef, className: string, label: string) => {
    decorations.push(
      Decoration.widget(note.from, () => badge(className, label, note.id), {
        side: -1,
        key: `${className}:${note.id}:${label}`,
        ignoreSelection: true,
      }),
      Decoration.inline(note.from, note.to, {
        class: from <= note.to && to >= note.from ? "footnote-raw" : "footnote-hidden",
      }),
    );
  };
  for (const ref of notes.refs) dress(ref, "footnote-num", String(notes.numbers.get(ref.id)));
  for (const def of notes.defs) dress(def, "footnote-def", `${notes.numbers.get(def.id)}.`);
  return DecorationSet.create(state.doc, decorations);
}

/** The floating preview of a footnote's text, shown while its number is hovered. */
class FootnoteTip {
  private readonly tip = document.createElement("div");

  constructor(private readonly view: EditorView) {
    this.tip.className = "footnote-tip";
    this.tip.setAttribute("role", "tooltip");
    document.body.appendChild(this.tip);
    view.dom.addEventListener("mouseover", this.onOver);
    view.dom.addEventListener("mouseout", this.hide);
    view.dom.addEventListener("mousedown", this.hide);
  }

  destroy() {
    this.view.dom.removeEventListener("mouseover", this.onOver);
    this.view.dom.removeEventListener("mouseout", this.hide);
    this.view.dom.removeEventListener("mousedown", this.hide);
    this.tip.remove();
  }

  private readonly onOver = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".footnote-num") : null;
    if (!target) return;
    const notes = footnotesKey.getState(this.view.state);
    const def = notes?.defs.find((note) => note.id === target.dataset.footnote);
    if (!def?.text) return;
    this.tip.textContent = def.text;
    this.tip.dataset.shown = "true";
    const rect = target.getBoundingClientRect();
    const tip = this.tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - tip.width / 2), window.innerWidth - tip.width - 8);
    // Above the number; below it when there is no room.
    const top = rect.top - tip.height - 6 < 8 ? rect.bottom + 6 : rect.top - tip.height - 6;
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${top}px`;
  };

  private readonly hide = () => {
    this.tip.dataset.shown = "false";
  };
}

/** ⌘/Ctrl-click a number: jump to its definition, or from a definition back to the first reference. */
function jump(view: EditorView, event: MouseEvent) {
  if (!(event.metaKey || event.ctrlKey) || !(event.target instanceof Element)) return false;
  const badgeElement = event.target.closest<HTMLElement>(".footnote-num, .footnote-def");
  const notes = footnotesKey.getState(view.state);
  if (!badgeElement || !notes) return false;
  const id = badgeElement.dataset.footnote;
  const target = badgeElement.classList.contains("footnote-num")
    ? notes.defs.find((note) => note.id === id)
    : notes.refs.find((note) => note.id === id);
  if (!target) return false;
  event.preventDefault();
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, target.to)).scrollIntoView(),
  );
  view.focus();
  return true;
}

/** Consecutive `[^id]: …` lines (with their indented continuations) opening `src`. */
const DEF_BLOCK = /^(?:\[\^[^\]\s^]+\]:[^\n]*(?:\n(?![ \t]*\n)[^\n]+)*)/;

export const FootnoteView = Extension.create({
  name: "footnoteView",
  // Markdown reads `[^1]: word` as a link reference definition, which would
  // swallow the line and turn every `[^1]` into a link to "word". Claim these
  // lines first and hand them on as an ordinary paragraph.
  markdownTokenizer: {
    name: "footnoteDefinition",
    level: "block",
    start: (src: string) => src.search(/^\[\^[^\]\s^]+\]:/m),
    tokenize: (src, _tokens, lexer) => {
      const match = DEF_BLOCK.exec(src);
      if (!match) return undefined;
      const text = match[0];
      return { type: "paragraph", raw: text, text, tokens: lexer.inlineTokens(text) };
    },
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<Footnotes>({
        key: footnotesKey,
        state: {
          init: (_, state) => scanFootnotes(state.doc),
          apply: (tr, value) => (tr.docChanged ? scanFootnotes(tr.doc) : value),
        },
        props: {
          decorations(state) {
            const notes = footnotesKey.getState(state);
            return notes ? footnoteDecorations(state, notes) : DecorationSet.empty;
          },
          handleDOMEvents: { mousedown: jump },
        },
        view: (view) => new FootnoteTip(view),
      }),
    ];
  },
});
