export type Theme = "system" | "light" | "dark";
export type Language = "en" | "zh-CN";
export type AgentPermission = "readOnly" | "readWrite" | "fullAccess";
export type ImageUploadMode = "local" | "custom";

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

export type View = { type: "note"; note: NoteRef };
