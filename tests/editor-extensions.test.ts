import { expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { NonInclusiveLink } from "../src/components/editor/link";

test("link marks do not extend into text typed after a URL", () => {
  const schema = getSchema([
    StarterKit.configure({ link: false }),
    NonInclusiveLink.configure({ autolink: true }),
  ]);
  const url = "https://ornata.app";
  const link = schema.marks.link.create({ href: url });
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text(url, [link])]),
  ]);

  expect(doc.resolve(url.length + 1).marks()).not.toContainEqual(link);
  expect(schema.marks.link.spec.toDOM?.(link, { inline: true })).toEqual([
    "a",
    expect.objectContaining({ class: "ornata-link", href: url }),
    0,
  ]);
});
