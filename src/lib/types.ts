export type Theme = "system" | "light" | "dark";

/** Colour schemes, chosen separately for light and for dark mode. */
export type LightPalette = "default" | "paper" | "paper-textured";
export type DarkPalette =
  | "default"
  | "basalt"
  | "tokyo-techno"
  | "early-ember"
  | "neon-noir";
export type Language = "en" | "zh-CN";
export type ImageUploadMode = "local" | "custom";

/** PDF page setup (Rust `config::PdfSettings`). */
export type PaperSize = "system" | "a4" | "letter" | "a5";
export type PageMargins = "narrow" | "normal" | "wide";
export interface PdfSettings {
  paper: PaperSize;
  margins: PageMargins;
}

export interface ImageUpload {
  mode: ImageUploadMode;
  command: string;
}

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
  lightPalette: LightPalette;
  darkPalette: DarkPalette;
  outlineSound: boolean;
  cursorAnimation: boolean;
  imageUpload: ImageUpload;
}

/** Scalar settings served to the standalone settings window. */
export interface SettingsSnapshot {
  theme: Theme;
  lightPalette: LightPalette;
  darkPalette: DarkPalette;
  language: Language;
  outlineSound: boolean;
  cursorAnimation: boolean;
  imageUpload: ImageUpload;
  vaultPath: string | null;
  vaultName: string | null;
}

/** How one backup run went (the zip's name, or the error). */
export interface BackupRecord {
  atMs: number;
  ok: boolean;
  detail: string;
  size: number;
}

export interface BackupInfo {
  folder: string | null;
  suggestions: Array<{ label: string; path: string }>;
  last: BackupRecord | null;
}

/** The vault's link graph (notes as nodes, internal links as edges). */
export interface GraphNode {
  rel: string;
  title: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface LinkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** A vault image asset no note references (cleanup candidate). */
export interface UnusedAsset {
  name: string;
  /** Bytes. */
  size: number;
}

/** File tree ordering: backend name order, or notes by last modification. */
export type TreeSort = "name" | "modified";

/** A tag and how many notes carry it. */
export interface TagCount {
  tag: string;
  count: number;
}

/** One saved snapshot of a note (metadata only). */
export interface SnapshotMeta {
  /** Unix millis; also the snapshot's filename stem. */
  timestamp: number;
  /** Snapshot size in bytes. */
  size: number;
}

/** One moved entry: `from`/`to` are vault rels (notes end in .md). */
export interface LinkRewrite {
  from: string;
  to: string;
}

/** Result of rename/move: the entry's new rel plus link rewrites on disk. */
export interface RenameOutcome {
  next: string;
  rewrites: LinkRewrite[];
  /** Rels of notes whose body was rewritten (for the "updated N notes" toast). */
  files: string[];
}

export interface Backlink {
  rel: string;
  title: string;
  /** Raw markdown lines linking here (first few); render via `parseInline`. */
  snippets: string[];
  /** Total number of linking lines in that note. */
  count: number;
}

/** A note mentioning another note's title in plain text, without a link. */
export interface Mention {
  rel: string;
  title: string;
  /** First few mentioning lines; `text` doubles as the link-mention guard. */
  lines: { line: number; text: string }[];
  /** Total number of mentioning lines in that note. */
  count: number;
}

export interface OpenTask {
  rel: string;
  title: string;
  line: number;
  text: string;
}

export interface SearchHit {
  rel: string;
  title: string;
  snippet: string;
  titleMatch: boolean;
  /** First matched term (used to reveal the hit inside the note). */
  term: string;
}

export interface ExternalNote {
  path: string;
  title: string;
}

export type NoteRef =
  | { kind: "vault"; rel: string }
  | { kind: "external"; path: string };

/** The vault's link graph, open as a tab beside notes. */
export type GraphTab = { kind: "graph" };

/** Issue state, written as the task box: `[ ]` `[/]` `[x]` `[-]`. */
export type IssueStatus = "todo" | "doing" | "done" | "canceled";
export type IssuePriority = "urgent" | "high" | "medium" | "low";

/** One task line of a project note (Rust `issues::Issue`). */
export interface Issue {
  rel: string;
  line: number;
  /** The line after the box, verbatim — the guard for edits. */
  text: string;
  /** `text` minus the `#tag` / `!priority` / `@date` tokens. */
  title: string;
  status: IssueStatus;
  priority: IssuePriority | null;
  due: string | null;
  tags: string[];
  /** Agent working on it (`+name` on the line), if one claimed it. */
  agent: string | null;
  /** Day it was marked done (`✓YYYY-MM-DD` on the line). */
  completed: string | null;
  /** Nearest heading above the line (below the H1). */
  milestone: string | null;
  /** Plain bullets indented under the task. */
  notes: string[];
  depth: number;
}

/** A folder marked as a project, with issue counts by status. */
export interface ProjectSummary {
  rel: string;
  name: string;
  todo: number;
  doing: number;
  done: number;
  canceled: number;
}

/** The project space (issues of marked folders), open as a tab beside notes. */
export type ProjectsTab = { kind: "projects" };

/** Anything the tab strip can hold. Notes stay `NoteRef` everywhere else. */
export type TabRef = NoteRef | GraphTab | ProjectsTab;

export type View = { type: "note"; note: NoteRef } | { type: "graph" } | { type: "projects" };

/** What external agents (the `ornata` command line / MCP server) may do. */
export type CliAccess = "off" | "readOnly" | "readWrite" | "full";

export interface McpSession {
  pid: number;
  vault: string;
  /** The agent's own name from the MCP handshake, e.g. "claude-code". */
  client: string;
  startedMs: number;
}

export interface McpServerStatus {
  running: boolean;
  port: number;
  activity: { lastClient: string; lastSeenMs: number; sessions: number } | null;
  /** Agents send `Authorization: Bearer <token>`; empty until the server first starts. */
  token: string;
}

export interface McpStatus {
  vaultPath: string | null;
  access: CliAccess;
  sessions: McpSession[];
  executable: string;
  installedAt: string | null;
  server: McpServerStatus;
}

export interface McpInstallOutcome {
  path: string;
  onPath: boolean;
}
