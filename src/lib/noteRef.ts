import type { GraphTab, NoteRef, TabRef, View } from "./types";

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

/** True when `path` is `rel` or a note inside that folder. */
export function relIsUnder(path: string, rel: string): boolean {
  return path === rel || path.startsWith(`${rel}/`);
}

/** Rewrite vault rels after `rel` was renamed or moved to `next`. */
export function remapRelList(paths: string[], rel: string, next: string): string[] {
  const out: string[] = [];
  for (const path of paths) {
    const mapped =
      path === rel ? next : path.startsWith(`${rel}/`) ? next + path.slice(rel.length) : path;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

/** Map an absolute path under the active notes directory back to a vault ref. */
export function noteRefForPath(root: string, path: string): NoteRef {
  const notesPrefix = `${root.replace(/[\\/]$/, "")}/notes/`;
  return path.startsWith(notesPrefix)
    ? vaultNote(path.slice(notesPrefix.length))
    : externalNote(path);
}

export const GRAPH_TAB: GraphTab = { kind: "graph" };

export function isNoteTab(tab: TabRef): tab is NoteRef {
  return tab.kind !== "graph";
}

export function tabKey(tab: TabRef): string {
  return isNoteTab(tab) ? noteKey(tab) : "graph";
}

export function sameTab(a: TabRef, b: TabRef): boolean {
  return tabKey(a) === tabKey(b);
}

/** The view that shows `tab`. */
export function viewOfTab(tab: TabRef): View {
  return isNoteTab(tab) ? { type: "note", note: tab } : { type: "graph" };
}

/** The tab that `view` shows. */
export function tabOfView(view: View): TabRef {
  return view.type === "note" ? view.note : GRAPH_TAB;
}
