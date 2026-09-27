import { expect, test } from "bun:test";
import {
  headingPlainText,
  hrefToRel,
  relToHref,
  resolveWiki,
  rewriteLinksInMarkdown,
  splitWikiTarget,
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

test("headingPlainText matches what the DOM renders", () => {
  expect(headingPlainText("hello_world")).toBe("hello_world");
  expect(headingPlainText("Title ##")).toBe("Title");
  expect(headingPlainText("**你好** 和 `code`")).toBe("你好 和 code");
  expect(headingPlainText("__加粗__ 文字")).toBe("加粗 文字");
  expect(headingPlainText("See [other](note.md) now")).toBe("See other now");
  expect(headingPlainText("logo ![pic](a.png) end")).toBe("logo end");
  expect(headingPlainText("[[projects/app|the app]] intro")).toBe("the app intro");
});

test("splitWikiTarget splits note target and heading", () => {
  expect(splitWikiTarget("笔记")).toEqual({ target: "笔记", heading: null });
  expect(splitWikiTarget("笔记#标题")).toEqual({ target: "笔记", heading: "标题" });
  expect(splitWikiTarget("a#b#c")).toEqual({ target: "a", heading: "b#c" });
});

test("wikiToMarkdown emits heading fragments with encoded hrefs", () => {
  const md = "a [[Journal# Late Ideas]] b [[projects/app#TODO|todo]]";
  expect(wikiToMarkdown(md, notes)).toBe(
    "a [Journal › Late Ideas](Journal.md#Late%20Ideas) b [todo](projects/app.md#TODO)",
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

test("wiki fragments survive renames and folder moves", () => {
  const md = "[[projects/app#标题]] [[projects/app#标题|t]]";
  expect(
    rewriteLinksInMarkdown(md, [{ from: "projects/app.md", to: "work/renamed.md" }]),
  ).toBe("[[work/renamed#标题]] [[work/renamed#标题|t]]");
  expect(
    rewriteLinksInMarkdown(md, [{ from: "projects", to: "work" }], [
      { rel: "work/app.md" },
    ]),
  ).toBe("[[work/app#标题]] [[work/app#标题|t]]");
});

test("rewriteLinksInMarkdown skips frontmatter", () => {
  const md = "---\ntitle: [x](projects/app.md)\n---\n[link](projects/app.md)";
  expect(
    rewriteLinksInMarkdown(md, [{ from: "projects/app.md", to: "work/app.md" }]),
  ).toBe("---\ntitle: [x](projects/app.md)\n---\n[link](work/app.md)");
});
