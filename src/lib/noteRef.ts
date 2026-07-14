import type { NoteRef } from "./types";

export const vaultNote = (rel: string): NoteRef => ({ kind: "vault", rel });

export const externalNote = (path: string): NoteRef => ({
  kind: "external",
  path,
});

export function noteKey(note: NoteRef): string {
  return note.kind === "vault" ? `vault:${note.rel}` : `external:${note.path}`;
}

export function sameNote(a: NoteRef, b: NoteRef): boolean {
  return noteKey(a) === noteKey(b);
}

export function noteTitle(note: NoteRef): string {
  const path = note.kind === "vault" ? note.rel : note.path;
  return (path.split(/[\\/]/).pop() ?? path).replace(/\.(?:md|markdown)$/i, "");
}

export function noteDisplayPath(root: string, note: NoteRef): string {
  return note.kind === "vault" ? `${root}/notes/${note.rel}` : note.path;
}

export function noteAssetRoot(root: string, note: NoteRef): string {
  if (note.kind === "vault") return root;
  const separator = Math.max(note.path.lastIndexOf("/"), note.path.lastIndexOf("\\"));
  return separator > 0 ? note.path.slice(0, separator) : "";
}

/** Map an absolute path under the active notes directory back to a vault ref. */
export function noteRefForPath(root: string, path: string): NoteRef {
  const notesPrefix = `${root.replace(/[\\/]$/, "")}/notes/`;
  return path.startsWith(notesPrefix)
    ? vaultNote(path.slice(notesPrefix.length))
    : externalNote(path);
}
