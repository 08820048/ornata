import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

let changelogDraft: typeof import("../src/lib/projectDocs").changelogDraft;
let daysBefore: typeof import("../src/lib/projectDocs").daysBefore;
let weeklyReview: typeof import("../src/lib/projectDocs").weeklyReview;
beforeAll(async () => {
  GlobalRegistrator.register();
  ({ changelogDraft, daysBefore, weeklyReview } = await import("../src/lib/projectDocs"));
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});
import type { Issue } from "../src/lib/types";

const issue = (over: Partial<Issue>): Issue => ({
  rel: "App/Plan.md", line: 0, text: "", title: "x", status: "todo", priority: null, due: null,
  tags: [], agent: null, completed: null, milestone: null, notes: [], depth: 0, ...over,
});

test("a changelog lists only the milestone's done issues, with their decisions", () => {
  const out = changelogDraft("V1", [
    issue({ title: "Fix graph", status: "done", milestone: "V1", notes: ["thin edges"] }),
    issue({ title: "Open", milestone: "V1" }),
    issue({ title: "Dropped", status: "canceled", milestone: "V1" }),
    issue({ title: "Elsewhere", status: "done", milestone: "V2" }),
  ]);
  expect(out).toBe("# V1\n\n- Fix graph\n  - thin edges\n");
});

test("days are counted across month and year ends", () => {
  expect(daysBefore("2026-11-03", 6)).toBe("2026-10-28");
  expect(daysBefore("2026-01-02", 6)).toBe("2025-12-27");
});

test("the review covers the last seven days, what is moving and what is late", () => {
  const out = weeklyReview(
    [
      issue({ title: "Shipped", status: "done", completed: "2026-10-26", milestone: "V1", notes: ["why"] }),
      issue({ title: "Too old", status: "done", completed: "2026-10-01" }),
      issue({ title: "Unstamped", status: "done" }),
      issue({ title: "Working", status: "doing", agent: "claude-code" }),
      issue({ title: "Late", due: "2026-10-20" }),
      issue({ title: "Later", due: "2026-12-01" }),
    ],
    "2026-10-26",
  );
  expect(out).toContain("- Shipped (V1)\n  - why");
  expect(out).toContain("- Working +claude-code");
  expect(out).toContain("- Late @2026-10-20");
  for (const absent of ["Too old", "Unstamped", "Later"]) expect(out).not.toContain(absent);
});

test("a review with nothing stamped explains why", () => {
  expect(weeklyReview([issue({ title: "Done", status: "done" })], "2026-10-26")).toContain("> ");
});
