import { expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { parseMarkdownSlice } from "../src/components/editor/markdownPaste";

test("parses pasted Markdown into editor nodes", () => {
  const extensions = [StarterKit];
  const manager = new MarkdownManager({
    extensions,
    indentation: { style: "space", size: 2 },
    markedOptions: {},
  });
  const slice = parseMarkdownSlice(
    getSchema(extensions),
    manager,
    "# Heading\n\n- one\n- two",
  );

  expect(slice.content.firstChild?.type.name).toBe("heading");
  expect(slice.content.lastChild?.type.name).toBe("bulletList");
});
