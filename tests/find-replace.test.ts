import { expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { findMatches } from "../src/components/editor/findReplace";

const schema = getSchema([StarterKit]);
const doc = (text: string) =>
  schema.node("doc", null, [schema.node("paragraph", null, text ? schema.text(text) : undefined)]);

const docWith = (...children: ProseMirrorNode[]) =>
  schema.node("doc", null, [schema.node("paragraph", null, children)]);

test("finds simple matches case-insensitively by default", () => {
  const node = doc("Hello hello hello");
  expect(findMatches(node, "hello", false).length).toBe(3);
  expect(findMatches(node, "hello", true).length).toBe(2);
  expect(findMatches(node, "HELLO", true).length).toBe(0);
});

test("matches across mark boundaries within a block", () => {
  const node = docWith(
    schema.text("say ", [schema.mark("bold")]),
    schema.text("hello "),
    schema.text("world", [schema.mark("italic")]),
  );
  // "hello world" spans a plain run and a marked run.
  const matches = findMatches(node, "hello world", false);
  expect(matches.length).toBe(1);
});

test("does not match across block boundaries", () => {
  const node = schema.node("doc", null, [
    schema.node("paragraph", null, schema.text("hello")),
    schema.node("paragraph", null, schema.text("world")),
  ]);
  expect(findMatches(node, "hello world", false).length).toBe(0);
});

test("offsets map through leading marks and multiple runs", () => {
  const node = docWith(
    schema.text("abcdef", [schema.mark("bold")]),
    schema.text("ghijkl"),
  );
  const matches = findMatches(node, "cdefgh", false);
  expect(matches.length).toBe(1);
  expect(matches[0].to - matches[0].from).toBe(6);
});

test("empty and gap-containing queries never match", () => {
  expect(findMatches(doc("text"), "", false).length).toBe(0);
  expect(findMatches(doc("text"), "\uFFFC", false).length).toBe(0);
});

test("overlapping occurrences report each start", () => {
  const node = doc("aaa");
  expect(findMatches(node, "aa", false).length).toBe(1);
});
