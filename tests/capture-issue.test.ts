import { expect, test } from "bun:test";
import { issueLine, owningProject } from "../src/lib/captureIssue";

const project = (rel: string) => ({ rel, name: rel, todo: 0, doing: 0, done: 0, canceled: 0 });

test("a selection becomes one task line linking back to its note", () => {
  expect(issueLine("  fix the\n graph  search ", "Ideas/Graph notes.md")).toBe(
    "fix the graph search [Graph notes](Ideas/Graph%20notes.md)",
  );
  expect(issueLine("- [ ] already a task", "a.md")).toBe("already a task [a](a.md)");
  expect(issueLine(" \n ", "a.md")).toBeNull();
});

test("the innermost project owns a note, and loose notes have none", () => {
  const list = [project("App"), project("App/Sub"), project("Other")];
  expect(owningProject(list, "App/Sub/x.md")?.rel).toBe("App/Sub");
  expect(owningProject(list, "App/x.md")?.rel).toBe("App");
  expect(owningProject(list, "Apple/x.md")).toBeNull();
  expect(owningProject(list, "root.md")).toBeNull();
});
