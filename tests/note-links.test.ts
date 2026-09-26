import { expect, test } from "bun:test";
import {
  hrefToRel,
  relToHref,
  resolveWiki,
  rewriteLinksInMarkdown,
  wikiToMarkdown,
} from "../src/lib/noteLinks";

test("hrefToRel resolves vault-relative paths", () => {
  expect(hrefToRel("projects/app.md")).toBe("projects/app.md");
  expect(hrefToRel("./app.md")).toBe("app.md");
  expect(hrefToRel("/app.md")).toBe("app.md");
  expect(hrefToRel("app")).toBe("app.md");
  expect(hrefToRel("APP.MD")).toBe("APP.MD");
  expect(hrefToRel("projects/Big%20Idea.md")).toBe("projects/Big Idea.md");
  expect(hrefToRel("app.md#top")).toBe("app.md");
  expect(hrefToRel("app.md?x=1")).toBe("app.md");
});

test("hrefToRel rejects external and empty hrefs", () => {
  expect(hrefToRel("https://example.com")).toBeNull();
  expect(hrefToRel("mailto:a@b.c")).toBeNull();
  expect(hrefToRel("#anchor")).toBeNull();
  expect(hrefToRel("")).toBeNull();
  expect(hrefToRel(null)).toBeNull();
  expect(hrefToRel(undefined)).toBeNull();
});

test("relToHref percent-encodes each segment but keeps slashes", () => {
  expect(relToHref("projects/app.md")).toBe("projects/app.md");
  expect(relToHref("40-职业/面试.md")).toBe(
    "40-%E8%81%8C%E4%B8%9A/%E9%9D%A2%E8%AF%95.md",
  );
  expect(relToHref("Big Idea.md")).toBe("Big%20Idea.md");
});

const notes = [
  { rel: "projects/app.md" },
  { rel: "notes/ideas/app.md" },
  { rel: "Journal.md" },
];

test("resolveWiki prefers full rel, then bare filename, then falls back", () => {
  expect(resolveWiki("projects/app", notes).rel).toBe("projects/app.md");
  expect(resolveWiki("Journal", notes).rel).toBe("Journal.md");
  expect(resolveWiki("APP", notes).rel).toBe("projects/app.md");
  expect(resolveWiki("missing", notes).rel).toBe("missing.md");
  expect(resolveWiki("projects/app", notes).title).toBe("app");
});

test("wikiToMarkdown converts wiki syntax and keeps the rest verbatim", () => {
  const md = "a [[Journal]] b [[projects/app|the app]] c [x](y.md)";
  expect(wikiToMarkdown(md, notes)).toBe(
    "a [Journal](Journal.md) b [the app](projects/app.md) c [x](y.md)",
  );
});

test("rewriteLinksInMarkdown repoints markdown hrefs to the new rel", () => {
  const md = "see [idea](projects/Big%20Idea.md) and [raw](projects/Big Idea.md)";
  expect(
    rewriteLinksInMarkdown(md, [
      { from: "projects/big idea.md", to: "archive/New Idea.md" },
    ]),
  ).toBe("see [idea](archive/New%20Idea.md) and [raw](archive/New%20Idea.md)");
});

test("rewriteLinksInMarkdown preserves ./ prefixes and #fragments", () => {
  const md = "[a](./app.md#top) [b](/projects/app.md?x=1)";
  expect(
    rewriteLinksInMarkdown(md, [
      { from: "app.md", to: "notes/app.md" },
      { from: "projects/app.md", to: "work/app.md" },
    ]),
  ).toBe("[a](./notes/app.md#top) [b](/work/app.md?x=1)");
});

test("rewriteLinksInMarkdown rewrites folder prefixes and leaves others alone", () => {
  const md =
    "[in](projects/app.md) [out](other/note.md) [web](https://x/projects/app.md) [[projects/app]] [[projects/app|t]]";
  expect(
    rewriteLinksInMarkdown(md, [{ from: "projects", to: "work" }], [
      { rel: "work/app.md" },
    ]),
  ).toBe(
    "[in](work/app.md) [out](other/note.md) [web](https://x/projects/app.md) [[work/app]] [[work/app|t]]",
  );
});

test("rewriteLinksInMarkdown rewrites a bare wiki name only when unambiguous", () => {
  const md = "[[app]] [[app|alias]]";
  expect(
    rewriteLinksInMarkdown(md, [{ from: "projects/app.md", to: "work/renamed app.md" }], [
      { rel: "work/renamed app.md" },
    ]),
  ).toBe("[[renamed app]] [[renamed app|alias]]");

  // Another note still claims the basename "app" — leave the shorthand alone.
  expect(
    rewriteLinksInMarkdown(md, [{ from: "projects/app.md", to: "work/renamed app.md" }], [
      { rel: "work/renamed app.md" },
      { rel: "archive/app.md" },
    ]),
  ).toBe(md);
});

test("rewriteLinksInMarkdown skips frontmatter", () => {
  const md = "---\ntitle: [x](projects/app.md)\n---\n[link](projects/app.md)";
  expect(
    rewriteLinksInMarkdown(md, [{ from: "projects/app.md", to: "work/app.md" }]),
  ).toBe("---\ntitle: [x](projects/app.md)\n---\n[link](work/app.md)");
});
