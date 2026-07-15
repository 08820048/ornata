export type Theme = "system" | "light" | "dark";
export type Language = "en" | "zh-CN";
export type AgentPermission = "readOnly" | "readWrite" | "fullAccess";

export type NodeKind = "folder" | "note";

export interface TreeNode {
  name: string;
  /** Path relative to the vault's notes root, e.g. "projects/app.md". */
  rel: string;
  kind: NodeKind;
  children?: TreeNode[];
  modifiedMs: number;
}

export interface VaultSnapshot {
  root: string;
  name: string;
  tree: TreeNode[];
  theme: Theme;
  outlineSound: boolean;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
  tags: string[];
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  image: string | null;
  favicon: string | null;
  metaFetched: boolean;
  tags: string[];
  createdAt: number;
}

export interface SearchHit {
  rel: string;
  title: string;
  snippet: string;
  titleMatch: boolean;
}

export interface ExternalNote {
  path: string;
  title: string;
}

export interface PiStatus {
  installed: boolean;
  running: boolean;
  path: string | null;
  version: string | null;
  permission: AgentPermission;
}

export type NoteRef =
  | { kind: "vault"; rel: string }
  | { kind: "external"; path: string };

export type View =
  | { type: "note"; note: NoteRef }
  | { type: "todos" }
  | { type: "bookmarks" };
