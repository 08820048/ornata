import { expect, test } from "bun:test";
import { mentionAt, noteReference, rankNotes } from "../src/components/agent/mentions";
import { messageWithContext } from "../src/lib/agentContext";

test("mentionAt finds the @query right before the caret, not emails", () => {
  expect(mentionAt("Compare @road", 13)).toEqual({ start: 8, query: "road" });
  expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
  expect(mentionAt("mail me@example.com", 19)).toBeNull();
  expect(mentionAt("@road and more", 14)).toBeNull();
  expect(mentionAt("x @ro|ad", 5)).toEqual({ start: 2, query: "ro" });
});

test("rankNotes puts title prefixes first, then recent, and skips mentioned", () => {
  const note = (rel: string, modifiedMs: number) => ({ rel, name: rel.split("/").pop()!, kind: "note" as const, modifiedMs });
  const notes = [note("a/Roadmap.md", 1), note("Old roadmap.md", 9), note("b/Road trip.md", 5), note("Other.md", 3)];
  expect(rankNotes(notes, "road", new Set()).map((n) => n.rel)).toEqual(["b/Road trip.md", "a/Roadmap.md", "Old roadmap.md"]);
  expect(rankNotes(notes, "road", new Set(["b/Road trip.md"])).map((n) => n.rel)).toEqual(["a/Roadmap.md", "Old roadmap.md"]);
});

test("context names mentions and linked notes as references, capped", () => {
  const linked = Array.from({ length: 25 }, (_, i) => noteReference(`l/${i}.md`));
  const text = messageWithContext("Summarize", null, null, {
    mentions: [noteReference("projects/Q3 Roadmap.md")],
    linked,
  });
  expect(text).toContain('"source":"notes/projects/Q3 Roadmap.md","title":"Q3 Roadmap"');
  expect(text).toContain("l/19.md");
  expect(text).not.toContain("l/20.md");
  expect(text.endsWith("User request:\n\nSummarize")).toBe(true);
  expect(messageWithContext("Hi", null, null)).toBe("Hi");
});
