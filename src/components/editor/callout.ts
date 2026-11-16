import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { t } from "@/stores/locale";

/** The five looks a callout can have (GitHub's alert types). */
export type CalloutKind = "note" | "tip" | "important" | "warning" | "caution";

/** Obsidian's extra type names, folded onto the five kinds. Unknown names read as a note. */
const ALIASES: Record<string, CalloutKind> = {
  note: "note",
  info: "note",
  abstract: "note",
  summary: "note",
  tldr: "note",
  todo: "note",
  example: "note",
  quote: "note",
  cite: "note",
  tip: "tip",
  hint: "tip",
  success: "tip",
  check: "tip",
  done: "tip",
  important: "important",
  question: "important",
  help: "important",
  faq: "important",
  warning: "warning",
  attention: "warning",
  caution: "caution",
  danger: "caution",
  error: "caution",
  failure: "caution",
  fail: "caution",
  missing: "caution",
  bug: "caution",
};

/** `[!type]` opening a quote, with Obsidian's optional fold sign. */
const MARKER = /^\[!([a-zA-Z]+)\][-+]?(?=\s|$)/;

export interface Callout {
  kind: CalloutKind;
  /** The type as written, lower-cased (`info`, `warning`, …). */
  name: string;
  /** Length of the `[!type]` marker in the first paragraph's text. */
  markerLength: number;
  /** Where the title ends, as an offset in the first paragraph (its first line). */
  titleEnd: number;
}

/**
 * A blockquote is a callout when its first paragraph starts with `[!type]`
 * — GitHub's alert and Obsidian's callout syntax. Nothing about the node
 * changes: the marker stays ordinary text, so the Markdown is saved as typed.
 */
export function calloutOf(quote: PmNode): Callout | null {
  if (quote.type.name !== "blockquote") return null;
  const first = quote.firstChild;
  const lead = first?.firstChild;
  if (first?.type.name !== "paragraph" || !lead?.isText) return null;
  const match = MARKER.exec(lead.text ?? "");
  if (!match) return null;
  let titleEnd = 0;
  for (let index = 0; index < first.childCount; index += 1) {
    const child = first.child(index);
    if (child.type.name === "hardBreak") break;
    titleEnd += child.nodeSize;
  }
  const name = match[1].toLowerCase();
  return { kind: ALIASES[name] ?? "note", name, markerLength: match[0].length, titleEnd };
}

/** What the label says: the localized kind, or an unfamiliar type as written. */
export function calloutLabel(callout: Callout): string {
  // An alias or an unfamiliar type keeps its own word (Info, Bug, …).
  if (callout.name !== callout.kind) return callout.name[0].toUpperCase() + callout.name.slice(1);
  return t(`callout.${callout.kind}`);
}

/** Tabler outline icons (MIT), one per kind. */
const ICONS: Record<CalloutKind, string[]> = {
  note: ["M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0", "M12 9h.01", "M11 12h1v4h1"],
  tip: [
    "M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7",
    "M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3",
    "M9.7 17l4.6 0",
  ],
  important: [
    "M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12",
    "M12 8v3",
    "M12 14v.01",
  ],
  warning: [
    "M12 9v4",
    "M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0",
    "M12 16h.01",
  ],
  caution: [
    "M12.802 2.165l5.575 2.389c.48 .206 .863 .589 1.07 1.07l2.388 5.574c.22 .512 .22 1.092 0 1.604l-2.389 5.575c-.206 .48 -.589 .863 -1.07 1.07l-5.574 2.388c-.512 .22 -1.092 .22 -1.604 0l-5.575 -2.389a2.036 2.036 0 0 1 -1.07 -1.07l-2.388 -5.574a2.036 2.036 0 0 1 0 -1.604l2.389 -5.575c.206 -.48 .589 -.863 1.07 -1.07l5.574 -2.388a2.036 2.036 0 0 1 1.604 0",
    "M12 8v4",
    "M12 16h.01",
  ],
};

function labelElement(kind: CalloutKind, label: string) {
  const span = document.createElement("span");
  span.className = "callout-label";
  span.contentEditable = "false";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[kind]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  span.append(svg, label);
  return span;
}

export const calloutKey = new PluginKey("callout");

/** Decorations that dress `> [!type]` quotes as callouts. */
export function calloutDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  const { from, to } = state.selection;
  state.doc.descendants((node, pos) => {
    const callout = calloutOf(node);
    if (!callout) return;
    // pos = the quote, +1 its first paragraph, +2 that paragraph's text.
    const start = pos + 2;
    const markerEnd = start + callout.markerLength;
    const label = calloutLabel(callout);
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: "callout",
        "data-callout": callout.kind,
      }),
      Decoration.widget(start, () => labelElement(callout.kind, label), {
        side: -1,
        key: `callout:${callout.kind}:${label}`,
        ignoreSelection: true,
      }),
      // With the caret in the marker it shows as typed, so the type can be edited.
      Decoration.inline(start, markerEnd, {
        class: from <= markerEnd && to >= start ? "callout-marker-raw" : "callout-marker",
      }),
    );
    if (pos + 2 + callout.titleEnd > markerEnd) {
      decorations.push(
        Decoration.inline(markerEnd, pos + 2 + callout.titleEnd, { class: "callout-title" }),
      );
    }
  });
  return DecorationSet.create(state.doc, decorations);
}

export const CalloutView = Extension.create({
  name: "calloutView",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: calloutKey,
        props: { decorations: calloutDecorations },
      }),
    ];
  },
});
