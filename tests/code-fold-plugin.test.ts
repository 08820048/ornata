import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import { CodeFold, codeFoldKey } from "../src/components/editor/codeFold";

const schema = getSchema([StarterKit]);
const plugins = CodeFold.config.addProseMirrorPlugins!.call({} as never);
const TEXT = "fn a() {\n    one();\n    two();\n}\nfn b() {\n    three();\n}";
const make = (language = "rust") =>
  EditorState.create({
    doc: schema.node("doc", null, [
      schema.node("codeBlock", { language }, [schema.text(TEXT)]),
      schema.node("paragraph", null, [schema.text("after")]),
    ]),
    plugins,
  });
const state = (s: EditorState) => codeFoldKey.getState(s)!;
const BASE = 1; // block starts at 0, its text at 1
const FIRST_HEADER_END = BASE + "fn a() {".length;

describe("CodeFold plugin", () => {
  test("folding a line hides its body, and unfolding brings it back", () => {
    let s = make();
    expect(state(s).hidden).toEqual([]);
    s = s.apply(s.tr.setMeta(codeFoldKey, { fold: FIRST_HEADER_END }));
    expect([...state(s).folded]).toEqual([FIRST_HEADER_END]);
    const [[from, to]] = state(s).hidden;
    expect(s.doc.textBetween(from, to)).toBe("\n    one();\n    two();");
    s = s.apply(s.tr.setMeta(codeFoldKey, { fold: FIRST_HEADER_END }));
    expect(state(s).hidden).toEqual([]);
  });

  test("collapsing a block hides everything after its first line", () => {
    let s = make();
    s = s.apply(s.tr.setMeta(codeFoldKey, { collapse: 0 }));
    const [[from, to]] = state(s).hidden;
    expect(s.doc.textBetween(from, to).startsWith("\n    one();")).toBe(true);
    expect(to).toBe(BASE + TEXT.length);
    expect([...state(s).collapsed]).toEqual([0]);
  });

  test("folds follow edits above them and disappear when their line is gone", () => {
    let s = make();
    s = s.apply(s.tr.setMeta(codeFoldKey, { fold: FIRST_HEADER_END }));
    s = s.apply(s.tr.insertText("XX", 1)); // typing before the header shifts the anchor
    expect([...state(s).folded]).toEqual([FIRST_HEADER_END + 2]);
    s = s.apply(s.tr.delete(1, s.doc.firstChild!.nodeSize - 1)); // clear the block
    expect(state(s).folded.size).toBe(0);
    expect(state(s).hidden).toEqual([]);
  });

  test("a caret inside hidden text is parked at the fold", () => {
    let s = make();
    s = s.apply(s.tr.setMeta(codeFoldKey, { fold: FIRST_HEADER_END }));
    const inside = s.doc.resolve(FIRST_HEADER_END + 3);
    const tr = s.tr.setSelection(new (s.selection.constructor as typeof import("@tiptap/pm/state").TextSelection)(inside));
    s = s.applyTransaction(tr).state;
    expect(s.selection.from).toBe(FIRST_HEADER_END);
  });

  test("mermaid blocks don't fold", () => {
    const s = make("mermaid");
    const next = s.apply(s.tr.setMeta(codeFoldKey, { fold: FIRST_HEADER_END }));
    expect(state(next).hidden).toEqual([]);
    expect(state(next).folded.size).toBe(0);
  });
});
