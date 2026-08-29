import { expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { isTrailable, textEditBetween } from "../src/components/editor/textTrail";

const schema = getSchema([StarterKit]);
const doc = (text: string) =>
  schema.node("doc", null, [
    schema.node("paragraph", null, text ? schema.text(text) : undefined),
  ]);
const boldDoc = (text: string) =>
  schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text(text, [schema.mark("bold")]),
    ]),
  ]);
const twoParagraphDoc = (first: string, second: string) =>
  schema.node("doc", null, [
    schema.node("paragraph", null, schema.text(first)),
    schema.node("paragraph", null, schema.text(second)),
  ]);

test("detects inserted and removed editor text", () => {
  expect(textEditBetween(doc("trail"), doc("trails"))).toEqual({
    from: 6,
    added: "s",
    removed: "",
  });
  expect(textEditBetween(doc("trail"), doc("trai"))).toEqual({
    from: 5,
    added: "",
    removed: "l",
  });
});

test("skips edits beyond the trail size guard", () => {
  expect(textEditBetween(doc(""), doc("a".repeat(20)))).toBeNull();
});

test("skips mark-only changes", () => {
  expect(textEditBetween(boldDoc("trail"), doc("trail"))).toBeNull();
});

test("cross-paragraph edits surface newlines for the trail filter", () => {
  const edit = textEditBetween(
    twoParagraphDoc("ab", "cd"),
    twoParagraphDoc("ax", "yd"),
  );
  expect(edit).not.toBeNull();
  expect(edit!.added).toContain("\n");
  expect(edit!.removed).toContain("\n");
});

test("isTrailable filters whitespace, multiline, and long text", () => {
  expect(isTrailable("s")).toBe(true);
  expect(isTrailable("12345678")).toBe(true);
  expect(isTrailable("  ")).toBe(false);
  expect(isTrailable("a\nb")).toBe(false);
  expect(isTrailable("123456789")).toBe(false);
});
