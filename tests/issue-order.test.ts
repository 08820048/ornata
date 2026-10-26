import { expect, test } from "bun:test";
import { columnIssues, priorityRank } from "../src/lib/issueOrder";
import type { Issue } from "../src/lib/types";

const issue = (title: string, status: Issue["status"], priority: Issue["priority"] = null): Issue => ({
  rel: "p.md", line: 0, text: title, title, status, priority, due: null, tags: [], agent: null, doneBy: null, created: null, closed: null, notes: [], depth: 0,
});

test("in progress lists the most urgent first and keeps note order among equals", () => {
  const all = [
    issue("none a", "doing"),
    issue("low", "doing", "low"),
    issue("urgent", "doing", "urgent"),
    issue("none b", "doing"),
    issue("high a", "doing", "high"),
    issue("high b", "doing", "high"),
    issue("medium", "doing", "medium"),
  ];
  expect(columnIssues(all, "doing").map((i) => i.title)).toEqual([
    "urgent", "high a", "high b", "medium", "low", "none a", "none b",
  ]);
});

test("every other column keeps the order of the notes, whatever the priority", () => {
  const all = [
    issue("low", "todo", "low"),
    issue("urgent", "todo", "urgent"),
    issue("done low", "done", "low"),
    issue("done urgent", "done", "urgent"),
  ];
  expect(columnIssues(all, "todo").map((i) => i.title)).toEqual(["low", "urgent"]);
  expect(columnIssues(all, "done").map((i) => i.title)).toEqual(["done low", "done urgent"]);
  expect(columnIssues(all, "canceled")).toEqual([]);
});

test("priorities rank from urgent down to none", () => {
  expect(["urgent", "high", "medium", "low", null].map((p) => priorityRank(p as Issue["priority"]))).toEqual([0, 1, 2, 3, 4]);
});
