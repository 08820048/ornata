import { expect, test } from "bun:test";
import { agentBrief } from "../src/lib/agentBrief";
import type { Issue } from "../src/lib/types";

const issue = (over: Partial<Issue>): Issue => ({
  rel: "App/Plan.md", line: 4, text: "", title: "Fix graph", status: "todo", priority: null,
  due: null, tags: [], agent: null, doneBy: null, created: null, closed: null, notes: [], depth: 0, ...over,
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

test("notes linking to the page are listed, minus the note holding the task", () => {
  const out = agentBrief(
    "App",
    issue({ title: "[Graph spec](App/issues/Graph%20spec.md)" }),
    [
      { rel: "App/Plan.md", title: "Plan", snippets: ["- [Graph spec](App/issues/Graph%20spec.md)"], count: 1 },
      { rel: "Ideas.md", title: "Ideas", snippets: ["see [Graph spec](App/issues/Graph%20spec.md) for\nthe edge idea", "x"], count: 2 },
    ],
  );
  expect(out).toContain("Other notes that link to its page:");
  expect(out).toContain("- Ideas (Ideas.md)");
  expect(out).toContain("> see [Graph spec](App/issues/Graph%20spec.md) for the edge idea");
  expect(out).not.toContain("Plan (App/Plan.md)");
});

test("without other backlinks the section is left out", () => {
  expect(agentBrief("App", issue({ title: "[Spec](App/issues/Spec.md)" }), [])).not.toContain("link to its page");
});
