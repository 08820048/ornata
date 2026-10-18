import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import { BlockPlus } from "../src/components/editor/blockPlus";
import { CodeFold, codeFoldKey } from "../src/components/editor/codeFold";
import { HeadingFold, headingFoldKey } from "../src/components/editor/headingFold";

/*
 * Widgets whose keys hold no document positions survive typing above them:
 * ProseMirror keeps their DOM instead of rebuilding every arrow per keystroke.
 */

const schema = getSchema([StarterKit]);
const doc = schema.node("doc", null, [
  schema.node("paragraph", null, [schema.text("top")]),
  schema.node("heading", { level: 2 }, [schema.text("A")]),
  schema.node("paragraph", null, []),
  schema.node("codeBlock", { language: "rust" }, [schema.text("fn a() {\n    one();\n}")]),
  schema.node("heading", { level: 2 }, [schema.text("B")]),
]);

type Plugin = ReturnType<NonNullable<typeof CodeFold.config.addProseMirrorPlugins>>[number];
const keys = (state: EditorState, plugin: Plugin) => {
  const own =
    plugin.spec.key === codeFoldKey
      ? codeFoldKey.getState(state)!.decorations
      : plugin.spec.key === headingFoldKey
        ? headingFoldKey.getState(state)!.decorations
        : (plugin.props.decorations!.call(plugin, state) as DecorationSet);
  return own
    .find()
    .map((d) => (d as unknown as { spec: { key?: string } }).spec.key)
    .filter(Boolean)
    .sort();
};

describe("fold and + widgets don't rebuild when typing above them", () => {
  const cases = {
    CodeFold: CodeFold.config.addProseMirrorPlugins!.call({} as never)[0],
    HeadingFold: HeadingFold.config.addProseMirrorPlugins!.call({} as never)[0],
    BlockPlus: BlockPlus.config.addProseMirrorPlugins!.call({ editor: {} } as never)[0],
  };
  for (const [name, plugin] of Object.entries(cases)) {
    test(name, () => {
      let state = EditorState.create({ doc, plugins: [plugin] });
      const before = keys(state, plugin);
      expect(before.length).toBeGreaterThan(0);
      for (let i = 0; i < 5; i += 1) state = state.apply(state.tr.insertText("x", 2));
      expect(keys(state, plugin)).toEqual(before);
      expect(before.some((k) => /\d{2,}/.test(k ?? ""))).toBe(false); // no positions baked in
    });
  }
});
