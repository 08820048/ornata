import { expect, test } from "bun:test";
import { agentBrief } from "../src/lib/agentBrief";
import type { Issue } from "../src/lib/types";

const issue = (over: Partial<Issue>): Issue => ({
  rel: "App/Plan.md", line: 4, text: "", title: "Fix graph", status: "todo", priority: null,
  due: null, tags: [], agent: null, notes: [], depth: 0, ...over,
});

test("the brief names the line, the page and the recorded decisions", () => {
  const out = agentBrief("App", issue({
    title: "[Graph spec](App/issues/Graph%20spec.md)",
    priority: "high",
    tags: ["bug"],
    notes: ["keep edges thin"],
  }));
  expect(out).toContain('project "App"');
  expect(out).toContain("App/Plan.md, line 5");
  expect(out).toContain("Its page: App/issues/Graph spec.md");
  expect(out).toContain("priority: high · tags: #bug");
  expect(out).toContain("- keep edges thin");
  expect(out).toContain("claim_issue");
});

test("a plain task has no page or notes sections", () => {
  const out = agentBrief("App", issue({}));
  expect(out).not.toContain("Its page");
  expect(out).not.toContain("Decisions and notes");
});
