import { describe, expect, test } from "bun:test";
import { hiddenRanges, type FoldBlock } from "../src/components/editor/headingFold";

// h1 · p · h2 · p · p · h1 · p
const blocks: FoldBlock[] = [
  { pos: 0, size: 4, level: 1 },
  { pos: 4, size: 4, level: null },
  { pos: 8, size: 4, level: 2 },
  { pos: 12, size: 4, level: null },
  { pos: 16, size: 4, level: null },
  { pos: 20, size: 4, level: 1 },
  { pos: 24, size: 4, level: null },
];

describe("hiddenRanges", () => {
  test("a folded heading hides its body up to the next same-level heading", () => {
    expect(hiddenRanges(blocks, new Set([8]))).toEqual([{ heading: 8, from: 12, to: 20 }]);
  });

  test("a folded h1 swallows nested h2 sections", () => {
    expect(hiddenRanges(blocks, new Set([0]))).toEqual([{ heading: 0, from: 4, to: 20 }]);
  });

  test("an inner fold inside an outer fold adds no extra range", () => {
    expect(hiddenRanges(blocks, new Set([0, 8]))).toEqual([{ heading: 0, from: 4, to: 20 }]);
  });

  test("an empty section hides nothing; unfolded hides nothing", () => {
    expect(hiddenRanges([{ pos: 0, size: 4, level: 1 }], new Set([0]))).toEqual([]);
    expect(hiddenRanges(blocks, new Set())).toEqual([]);
  });

  test("the last section runs to the end of the note", () => {
    expect(hiddenRanges(blocks, new Set([20]))).toEqual([{ heading: 20, from: 24, to: 28 }]);
  });
});

import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import { HeadingFold, headingFoldKey } from "../src/components/editor/headingFold";

describe("HeadingFold plugin", () => {
  const schema = getSchema([StarterKit]);
  const p = (text: string) => schema.node("paragraph", null, [schema.text(text)]);
  const h = (level: number, text: string) =>
    schema.node("heading", { level }, [schema.text(text)]);
  const doc = schema.node("doc", null, [h(1, "A"), p("one"), p("two"), h(1, "B"), p("three")]);
  const plugins = HeadingFold.config.addProseMirrorPlugins!.call({} as never);
  const start = () => EditorState.create({ doc, plugins });
  const hiddenClasses = (state: EditorState) =>
    headingFoldKey
      .getState(state)!
      .decorations.find()
      .filter((d) => (d as unknown as { type: { attrs?: { class?: string } } }).type.attrs?.class === "fold-hidden");

  test("toggling a heading hides its section, toggling again restores it", () => {
    let state = start();
    expect(hiddenClasses(state)).toHaveLength(0);
    state = state.apply(state.tr.setMeta(headingFoldKey, { toggle: 0 }));
    expect(headingFoldKey.getState(state)!.folded.has(0)).toBe(true);
    expect(hiddenClasses(state)).toHaveLength(2);
    state = state.apply(state.tr.setMeta(headingFoldKey, { toggle: 0 }));
    expect(hiddenClasses(state)).toHaveLength(0);
  });

  test("folded positions follow edits and drop when the heading is deleted", () => {
    let state = start();
    state = state.apply(state.tr.setMeta(headingFoldKey, { toggle: 0 }));
    state = state.apply(state.tr.insert(0, p("new")));
    const shifted = [...headingFoldKey.getState(state)!.folded][0];
    expect(state.doc.nodeAt(shifted)?.textContent).toBe("A");
    state = state.apply(state.tr.delete(shifted, shifted + state.doc.nodeAt(shifted)!.nodeSize));
    expect(headingFoldKey.getState(state)!.folded.size).toBe(0);
  });
});
