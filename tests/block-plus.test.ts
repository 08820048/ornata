import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import { BlockPlus } from "../src/components/editor/blockPlus";

const schema = getSchema([StarterKit]);
const plugins = BlockPlus.config.addProseMirrorPlugins!.call({ editor: {} } as never);
const p = (text?: string) => schema.node("paragraph", null, text ? [schema.text(text)] : []);
const decorationsOf = (state: EditorState) =>
  plugins[0].props.decorations!.call(plugins[0], state) as DecorationSet;
const classes = (set: DecorationSet) =>
  set
    .find()
    .map((d) => (d as unknown as { type: { attrs?: { class?: string } } }).type.attrs?.class)
    .filter(Boolean);

describe("BlockPlus", () => {
  const doc = schema.node("doc", null, [p("text"), p(), p("more"), p()]);

  test("only empty top-level paragraphs get a plus", () => {
    const set = decorationsOf(EditorState.create({ doc, plugins }));
    // two empty lines → two node decorations and two widgets
    expect(set.find()).toHaveLength(4);
    expect(classes(set)).toEqual(["empty-line", "empty-line"]);
  });

  test("the line holding the caret is marked", () => {
    let state = EditorState.create({ doc, plugins });
    const emptyPos = doc.child(0).nodeSize; // start of the first empty paragraph
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, emptyPos + 1)));
    expect(classes(decorationsOf(state))).toEqual(["empty-line has-caret", "empty-line"]);
  });

  test("lists and quotes are left alone, and so are non-empty paragraphs", () => {
    const nested = schema.node("doc", null, [
      schema.node("bulletList", null, [schema.node("listItem", null, [p()])]),
      schema.node("blockquote", null, [p()]),
      p("full"),
    ]);
    expect(decorationsOf(EditorState.create({ doc: nested, plugins })).find()).toHaveLength(0);
  });
});
