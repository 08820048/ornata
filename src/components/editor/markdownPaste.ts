import type { MarkdownManager } from "@tiptap/markdown";
import { Slice, type Schema } from "@tiptap/pm/model";

export function parseMarkdownSlice(
  schema: Schema,
  manager: MarkdownManager,
  markdown: string,
) {
  const doc = schema.nodeFromJSON(manager.parse(markdown));
  return Slice.maxOpen(doc.content);
}
