import { invoke } from "@tauri-apps/api/core";
import type {
  AgentPermission,
  ExternalNote,
  ImageUpload,
  Language,
  AgentStatus,
  AgentConnection,
  AgentConnectionConfig,
  AgentConnections,
  AgentModel,
  AgentProvider,
  SearchHit,
  Backlink,
  Mention,
  RenameOutcome,
  SnapshotMeta,
  LinkGraph,
  TagCount,
  UnusedAsset,
  OpenTask,
  SettingsSnapshot,
  Theme,
  TreeNode,
  VaultSnapshot,
} from "./types";

interface ErrorPayload {
  kind: string;
  message: string;
}

export class IpcError extends Error {
  kind: string;

  constructor(payload: ErrorPayload) {
    super(payload.message);
    this.kind = payload.kind;
  }
}

async function call<T>(command: string, args?: Record<string, unknown>) {
  try {
    return await invoke<T>(command, args);
  } catch (raw) {
    if (raw && typeof raw === "object" && "message" in raw) {
      throw new IpcError(raw as ErrorPayload);
    }
    throw new IpcError({ kind: "other", message: String(raw) });
  }
}

export const ipc = {
  agentStatus: () => call<AgentStatus>("agent_status"),
  agentStart: () => call<AgentStatus>("agent_start"),
  agentSend: (message: string) => call<void>("agent_send", { message }),
  agentAbort: () => call<void>("agent_abort"),
  agentRespondApproval: (id: string, allow: boolean) =>
    call<void>("agent_respond_approval", { id, allow }),
  agentStop: () => call<void>("agent_stop"),
  agentSetPermission: (permission: AgentPermission) =>
    call<void>("agent_set_permission", { permission }),
  agentConnectionGet: () =>
    call<AgentConnection | null>("agent_connection_get"),
  agentConnectionsList: () =>
    call<AgentConnections>("agent_connections_list"),
  agentConnectionSave: (
    connection: AgentConnectionConfig,
    apiKey?: string,
    activate = true,
  ) =>
    call<AgentConnections>("agent_connection_save", { connection, apiKey, activate }),
  agentConnectionActivate: (slug: string) =>
    call<AgentConnections>("agent_connection_activate", { slug }),
  agentConnectionDelete: (slug: string) =>
    call<AgentConnections>("agent_connection_delete", { slug }),
  agentProvidersList: () => call<AgentProvider[]>("agent_providers_list"),
  agentModelsList: (provider: string) =>
    call<AgentModel[]>("agent_models_list", { provider }),
  agentOAuthStart: (provider: string, slug: string) =>
    call<string>("agent_oauth_start", { provider, slug }),
  agentOAuthRespond: (requestId: string, value?: string, error?: string) =>
    call<void>("agent_oauth_respond", { requestId, value, error }),
  agentOAuthCancel: () => call<void>("agent_oauth_cancel"),

  startup: () => call<VaultSnapshot | null>("startup"),
  chooseVault: () => call<VaultSnapshot | null>("choose_vault"),
  createVault: () => call<VaultSnapshot | null>("create_vault"),
  loadTree: () => call<TreeNode[]>("load_tree"),

  chooseExternalNotes: () =>
    call<ExternalNote[]>("choose_external_notes"),
  authorizeExternalNotes: (paths: string[]) =>
    call<ExternalNote[]>("authorize_external_notes", { paths }),
  takeOpenedExternalNotes: () =>
    call<ExternalNote[]>("take_opened_external_notes"),
  readExternalNote: (path: string) =>
    call<string>("read_external_note", { path }),
  writeExternalNote: (path: string, content: string) =>
    call<void>("write_external_note", { path, content }),
  renameExternalNote: (path: string, name: string) =>
    call<ExternalNote>("rename_external_note", { path, name }),
  deleteExternalNote: (path: string) =>
    call<void>("delete_external_note", { path }),
  saveExternalImage: (path: string, data: string, extension: string) =>
    call<string>("save_external_image", { path, data, extension }),
  openExternalLink: (path: string, href: string) =>
    call<ExternalNote | null>("open_external_link", { path, href }),

  readNote: (rel: string) => call<string>("read_note", { rel }),
  writeNote: (rel: string, content: string) =>
    call<void>("write_note", { rel, content }),
  createNote: (dir: string, title: string) =>
    call<string>("create_note", { dir, title }),
  createFolder: (dir: string, name: string) =>
    call<string>("create_folder", { dir, name }),
  noteHistory: (rel: string) => call<SnapshotMeta[]>("note_history", { rel }),
  listUnusedAssets: () => call<UnusedAsset[]>("list_unused_assets"),
  linkGraph: () => call<LinkGraph>("link_graph"),
  submitQuickCapture: (text: string) =>
    call<void>("submit_quick_capture", { text }),
  dismissQuickCapture: () => call<void>("dismiss_quick_capture"),
  trashAssets: (names: string[]) => call<number>("trash_assets", { names }),
  readAppData: (name: string) => call<string | null>("read_app_data", { name }),
  writeAppData: (name: string, content: string) =>
    call<void>("write_app_data", { name, content }),
  listTemplates: () => call<string[]>("list_templates"),
  readTemplate: (name: string) => call<string>("read_template", { name }),
  writeTemplate: (name: string, content: string) =>
    call<void>("write_template", { name, content }),
  revealTemplates: () => call<void>("reveal_templates"),
  listTags: () => call<TagCount[]>("list_tags"),
  notesWithTag: (tag: string) => call<string[]>("notes_with_tag", { tag }),
  readHistorySnapshot: (rel: string, timestamp: number) =>
    call<string>("read_history_snapshot", { rel, timestamp }),
  snapshotNote: (rel: string) => call<void>("snapshot_note", { rel }),
  renameEntry: (rel: string, name: string) =>
    call<RenameOutcome>("rename_entry", { rel, name }),
  moveEntry: (rel: string, dir: string) =>
    call<RenameOutcome>("move_entry", { rel, dir }),
  deleteEntry: (rel: string) => call<void>("delete_entry", { rel }),
  revealEntry: (rel: string) => call<void>("reveal_entry", { rel }),
  searchNotes: (query: string, limit?: number) =>
    call<SearchHit[]>("search_notes", { query, limit }),

  noteBacklinks: (rel: string) => call<Backlink[]>("note_backlinks", { rel }),
  unlinkedMentions: (rel: string) =>
    call<Mention[]>("unlinked_mentions", { rel }),
  linkMention: (
    rel: string,
    line: number,
    text: string,
    target: string,
    href: string,
  ) => call<void>("link_mention", { rel, line, text, target, href }),

  openTasks: () => call<OpenTask[]>("open_tasks"),

  completeTask: (rel: string, line: number, text: string) =>
    call<void>("complete_task", { rel, line, text }),

  exportNote: (rel: string, content: string) =>
    call<string | null>("export_note", { rel, content }),
  exportExternalNote: (path: string, content: string) =>
    call<string | null>("export_external_note", { path, content }),

  saveImageAsset: (data: string, extension: string) =>
    call<string>("save_image_asset", { data, extension }),
  getImageUpload: () => call<ImageUpload>("get_image_upload"),
  setImageUpload: (upload: ImageUpload) =>
    call<void>("set_image_upload", { upload }),
  uploadImage: (data: string, extension: string, command?: string) =>
    call<string>("upload_image", { data, extension, command }),
  readImage: (source: string) =>
    call<{ data: string; extension: string }>("read_image", { source }),
  saveImageAs: (source: string) =>
    call<string | null>("save_image_as", { source }),
  openLocalImage: (path: string) => call<void>("open_local_image", { path }),
  setTheme: (theme: Theme) => call<void>("set_theme", { theme }),
  setOutlineSound: (enabled: boolean) =>
    call<void>("set_outline_sound", { enabled }),
  setCursorAnimation: (enabled: boolean) =>
    call<void>("set_cursor_animation", { enabled }),
  getLanguage: () => call<Language>("get_language"),
  setLanguage: (language: Language) =>
    call<void>("set_language", { language }),

  settingsSnapshot: () => call<SettingsSnapshot>("get_settings"),
  openSettingsWindow: () => call<void>("open_settings_window"),
};
