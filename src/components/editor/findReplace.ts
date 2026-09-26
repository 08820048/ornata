import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * In-note find & replace. Matches are computed per text block with inline
 * nodes flattened (so "hello world" matches across a bold boundary); the
 * current match is highlighted separately and selection follows navigation.
 */

export interface MatchRange {
  from: number;
  to: number;
}

export interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: MatchRange[];
  index: number;
}

export const findReplaceKey = new PluginKey<FindState>("findReplace");

/** Placeholder char keeping offsets aligned across non-text inline nodes. */
const GAP = "\uFFFC";

interface Segment {
  /** Offset of this text run within the flattened block text. */
  start: number;
  /** Absolute doc position of the text run's first character. */
  pos: number;
  text: string;
}

function flattenBlock(block: ProseMirrorNode, blockPos: number): { text: string; segments: Segment[] } {
  let text = "";
  const segments: Segment[] = [];
  block.forEach((child, offset) => {
    if (child.isText && child.text) {
      segments.push({ start: text.length, pos: blockPos + 1 + offset, text: child.text });
      text += child.text;
    } else {
      text += GAP;
    }
  });
  return { text, segments };
}

/** Map an offset in the flattened text back to an absolute doc position. */
function mapOffset(segments: Segment[], offset: number): number | null {
  for (const segment of segments) {
    const end = segment.start + segment.text.length;
    if (offset < end) {
      return segment.pos + (offset - segment.start);
    }
  }
  const last = segments[segments.length - 1];
  return last ? last.pos + last.text.length : null;
}

export function findMatches(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
): MatchRange[] {
  const matches: MatchRange[] = [];
  if (!query || query.includes(GAP)) return matches;
  const needle = caseSensitive ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const { text, segments } = flattenBlock(node, pos);
    if (!segments.length) return;
    const haystack = caseSensitive ? text : text.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const from = mapOffset(segments, index);
      const to = mapOffset(segments, index + needle.length);
      if (from !== null && to !== null && to > from) {
        matches.push({ from, to });
      }
      index = haystack.indexOf(needle, index + needle.length);
    }
  });
  return matches;
}

type FindPatch = Partial<Pick<FindState, "query" | "caseSensitive" | "index">>;

export function dispatchFind(editor: Editor["view"], patch: FindPatch) {
  editor.dispatch(editor.state.tr.setMeta(findReplaceKey, patch));
}

export function currentMatch(state: EditorState): { count: number; index: number } {
  const value = findReplaceKey.getState(state);
  return { count: value?.matches.length ?? 0, index: value?.index ?? 0 };
}

/** Select and scroll to the match at `index` (wrapping in both directions). */
export function gotoMatch(
  editor: Editor,
  index: number,
) {
  const value = findReplaceKey.getState(editor.state);
  if (!value || !value.matches.length) return;
  const wrapped = ((index % value.matches.length) + value.matches.length) % value.matches.length;
  dispatchFind(editor.view, { index: wrapped });
  const match = value.matches[wrapped];
  editor.commands.setTextSelection({ from: match.from, to: match.to });
  editor.commands.scrollIntoView();
}

export function replaceCurrent(editor: Editor, replacement: string) {
  const value = findReplaceKey.getState(editor.state);
  if (!value || !value.matches.length) return;
  const match = value.matches[Math.min(value.index, value.matches.length - 1)];
  const { state } = editor;
  const tr = state.tr;
  const marks = state.doc.resolve(match.from).marks();
  tr.replaceWith(match.from, match.to, state.schema.text(replacement, marks));
  editor.view.dispatch(tr);
  // The plugin recomputes matches on the doc change; select what landed there.
  gotoMatch(editor, value.index);
}

export function replaceAll(editor: Editor, replacement: string) {
  const value = findReplaceKey.getState(editor.state);
  if (!value || !value.matches.length) return;
  const { state } = editor;
  const tr = state.tr;
  // Reverse order keeps earlier ranges valid while replacing.
  for (const match of [...value.matches].reverse()) {
    const marks = state.doc.resolve(match.from).marks();
    tr.replaceWith(match.from, match.to, state.schema.text(replacement, marks));
  }
  editor.view.dispatch(tr);
}

const findReplacePlugin = new Plugin<FindState>({
  key: findReplaceKey,
  state: {
    init: () => ({ query: "", caseSensitive: false, matches: [], index: 0 }),
    apply: (tr: Transaction, value: FindState) => {
      const meta = tr.getMeta(findReplaceKey) as FindPatch | undefined;
      if (meta) {
        const next = { ...value, ...meta };
        if (meta.query !== undefined || meta.caseSensitive !== undefined) {
          next.matches = findMatches(tr.doc, next.query, next.caseSensitive);
        }
        next.index = Math.min(
          Math.max(next.index, 0),
          Math.max(next.matches.length - 1, 0),
        );
        return next;
      }
      if (tr.docChanged) {
        if (!value.query) return value;
        const matches = findMatches(tr.doc, value.query, value.caseSensitive);
        return {
          ...value,
          matches,
          index: Math.min(value.index, Math.max(matches.length - 1, 0)),
        };
      }
      return value;
    },
  },
  props: {
    decorations: (state: EditorState) => {
      const value = findReplaceKey.getState(state);
      if (!value || !value.matches.length) return DecorationSet.empty;
      const decorations = value.matches.map((match, index) =>
        Decoration.inline(match.from, match.to, {
          class: index === value.index ? "find-match-current" : "find-match",
        }),
      );
      return DecorationSet.create(state.doc, decorations);
    },
  },
});

export const FindReplace = Extension.create({
  name: "findReplace",
  addProseMirrorPlugins() {
    return [findReplacePlugin];
  },
});
