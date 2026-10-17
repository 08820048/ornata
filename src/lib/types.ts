export type Theme = "system" | "light" | "dark";
export type Language = "en" | "zh-CN";
export type AgentPermission = "readOnly" | "readWrite" | "fullAccess";
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
  outlineSound: boolean;
  cursorAnimation: boolean;
  imageUpload: ImageUpload;
}

/** Scalar settings served to the standalone settings window. */
export interface SettingsSnapshot {
  theme: Theme;
  language: Language;
  outlineSound: boolean;
  cursorAnimation: boolean;
  imageUpload: ImageUpload;
  vaultPath: string | null;
  vaultName: string | null;
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

export interface AgentStatus {
  configured: boolean;
  running: boolean;
  provider: string | null;
  model: string | null;
  runtimeVersion: string;
  permission: AgentPermission;
}

export type AgentEndpointApi =
  | "openai-completions"
  | "anthropic-messages";

export type AgentAuthType =
  | "apiKey"
  | "oauth"
  | "iam"
  | "serviceAccount"
  | "environment"
  | "none";

export interface AgentConnectionConfig {
  slug: string;
  name: string;
  provider: string;
  model: string;
  authType: AgentAuthType;
  baseUrl: string | null;
  endpointApi: AgentEndpointApi | null;
}

export interface AgentConnection extends AgentConnectionConfig {
  credentialConfigured: boolean;
}

export interface AgentConnections {
  connections: AgentConnection[];
  activeSlug: string | null;
}

export interface AgentProvider {
  id: string;
  name: string;
  authMethods: AgentAuthType[];
  modelCount: number;
  dynamicModels: boolean;
}

export interface AgentModel {
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  input: string[];
}

export type NoteRef =
  | { kind: "vault"; rel: string }
  | { kind: "external"; path: string };

/** The vault's link graph, open as a tab beside notes. */
export type GraphTab = { kind: "graph" };

/** Anything the tab strip can hold. Notes stay `NoteRef` everywhere else. */
export type TabRef = NoteRef | GraphTab;

export type View = { type: "note"; note: NoteRef } | { type: "graph" };

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
