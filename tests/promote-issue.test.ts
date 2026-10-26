import { expect, test } from "bun:test";
import { isPromoted, promotedText } from "../src/lib/promoteIssue";
import type { Issue } from "../src/lib/types";

const issue = (over: Partial<Issue>): Issue => ({
  rel: "P/plan.md", line: 3, text: "", title: "Fix [graph] search", status: "todo",
  priority: "high", due: "2026-11-10", tags: ["bug"], agent: null, created: null, closed: null, notes: [], depth: 0, ...over,
});

test("a promoted line links to the page and keeps its tokens", () => {
  expect(promotedText(issue({}), "P/issues/Fix graph search.md")).toBe(
    "[Fix graph search](P/issues/Fix%20graph%20search.md) #bug !high @2026-11-10",
  );
  expect(promotedText(issue({ priority: null, due: null, tags: [] }), "a.md")).toBe("[Fix graph search](a.md)");
});

test("a promoted line keeps the claim and when it was made and finished", () => {
  const made = { priority: null, due: null, tags: [], agent: "claude-code", created: "2026-10-26T09:05" } as const;
  expect(promotedText(issue({ ...made }), "a.md")).toBe("[Fix graph search](a.md) +claude-code ◷2026-10-26T09:05");
  expect(promotedText(issue({ ...made, status: "done", closed: "2026-10-27T10:00" }), "a.md")).toContain(" ✓2026-10-27T10:00");
  expect(promotedText(issue({ ...made, status: "canceled", closed: "2026-10-27T10:00" }), "a.md")).toContain(" ✗2026-10-27T10:00");
});

test("an issue that is just a link counts as promoted", () => {
  expect(isPromoted(issue({ title: "[Spec](issues/Spec.md)" }))).toBe(true);
  expect(isPromoted(issue({ title: "Spec" }))).toBe(false);
  expect(isPromoted(issue({ title: "See [Spec](a.md) now" }))).toBe(false);
});
