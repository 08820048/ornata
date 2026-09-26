import { expect, test } from "bun:test";
import {
  joinFrontmatter,
  parseFrontmatter,
  splitFrontmatter,
} from "../src/lib/frontmatter";

test("splits a leading frontmatter block off the body", () => {
  const md = "---\ntitle: Hello\n---\n\nbody text\n";
  const { frontmatter, body } = splitFrontmatter(md);
  expect(frontmatter).toBe("---\ntitle: Hello\n---\n");
  expect(body).toBe("\nbody text\n");
});

test("handles CRLF frontmatter", () => {
  const md = "---\r\ntitle: Hello\r\n---\r\nbody\r\n";
  const { frontmatter, body } = splitFrontmatter(md);
  expect(frontmatter).toBe("---\r\ntitle: Hello\r\n---\r\n");
  expect(body).toBe("body\r\n");
});

test("treats documents without frontmatter as all body", () => {
  expect(splitFrontmatter("just text\n")).toEqual({
    frontmatter: "",
    body: "just text\n",
  });
  // `---` rules inside the text do not start a frontmatter block.
  expect(splitFrontmatter("text\n---\nmore\n")).toEqual({
    frontmatter: "",
    body: "text\n---\nmore\n",
  });
});

test("an unterminated opening fence stays body", () => {
  const md = "---\ntitle: never closed\n";
  expect(splitFrontmatter(md)).toEqual({ frontmatter: "", body: md });
});

test("frontmatter without a trailing newline keeps the body empty", () => {
  const { frontmatter, body } = splitFrontmatter("---\ntitle: X\n---");
  expect(frontmatter).toBe("---\ntitle: X\n---");
  expect(body).toBe("");
});

test("join is the exact inverse of split", () => {
  const md = "---\ntags:\n  - a\n  - b\n---\n\n# Head\n\ntext\n";
  const { frontmatter, body } = splitFrontmatter(md);
  expect(joinFrontmatter(frontmatter, body)).toBe(md);
});

test("parses scalars and lists from clipped notes", () => {
  const props = parseFrontmatter("---\ntitle: \"Quoted\"\nsource: x\nlink:\n  - a.md\n  - b.md\n---\n");
  expect(props).toEqual([
    { key: "title", value: "Quoted" },
    { key: "source", value: "x" },
    { key: "link", value: ["a.md", "b.md"] },
  ]);
});
