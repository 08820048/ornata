import type { TreeNode } from "@/lib/types";
import type { AgentNoteReference } from "@/stores/agent";

/* Pure helpers behind the composer's @-mentions (no React, no stores). */

const MAX_CANDIDATES = 6;

export const noteReference = (rel: string): AgentNoteReference => ({
  sourceKey: `vault:${rel}`,
  source: `notes/${rel}`,
  title: (rel.split("/").pop() ?? rel).replace(/\.md$/i, ""),
});

/** The `@query` being typed right before the caret, if any. */
export function mentionAt(draft: string, caret: number): { start: number; query: string } | null {
  const before = draft.slice(0, caret);
  const match = /(^|\s)@([^\s@]*)$/.exec(before);
  if (!match) return null;
  return { start: before.length - match[2].length - 1, query: match[2] };
}

/** Notes whose title matches, prefix matches first. */
export function rankNotes(notes: readonly TreeNode[], query: string, exclude: ReadonlySet<string>) {
  const needle = query.toLowerCase();
  return notes
    .filter((note) => !exclude.has(note.rel))
    .map((note) => {
      const title = note.name.replace(/\.md$/i, "").toLowerCase();
      const rank = !needle ? 1 : title.startsWith(needle) ? 0 : title.includes(needle) ? 1 : -1;
      return { note, rank };
    })
    .filter((hit) => hit.rank >= 0)
    .sort((a, b) => a.rank - b.rank || b.note.modifiedMs - a.note.modifiedMs)
    .slice(0, MAX_CANDIDATES)
    .map((hit) => hit.note);
}
