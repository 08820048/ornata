import { invoke } from "@tauri-apps/api/core";
import type {
  Bookmark,
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
  SettingsSnapshot,
  Theme,
  Todo,
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
  renameEntry: (rel: string, name: string) =>
    call<string>("rename_entry", { rel, name }),
  moveEntry: (rel: string, dir: string) =>
    call<string>("move_entry", { rel, dir }),
  deleteEntry: (rel: string) => call<void>("delete_entry", { rel }),
  revealEntry: (rel: string) => call<void>("reveal_entry", { rel }),
  searchNotes: (query: string, limit?: number) =>
    call<SearchHit[]>("search_notes", { query, limit }),

  todosList: () => call<Todo[]>("todos_list"),
  todoAdd: (text: string) => call<Todo>("todo_add", { text }),
  todoToggle: (id: string) => call<Todo>("todo_toggle", { id }),
  todoUpdate: (id: string, text: string) =>
    call<Todo>("todo_update", { id, text }),
  todoSetTags: (id: string, tags: string[]) =>
    call<Todo>("todo_set_tags", { id, tags }),
  todoTagsList: () => call<string[]>("todo_tags_list"),
  todoTagCreate: (name: string) => call<string[]>("todo_tag_create", { name }),
  todoTagDelete: (name: string) => call<string[]>("todo_tag_delete", { name }),
  todoDelete: (id: string) => call<void>("todo_delete", { id }),
  todosClearCompleted: () => call<Todo[]>("todos_clear_completed"),

  bookmarksList: () => call<Bookmark[]>("bookmarks_list"),
  bookmarkAdd: (url: string) => call<Bookmark>("bookmark_add", { url }),
  bookmarkUpdateTitle: (id: string, title: string) =>
    call<Bookmark>("bookmark_update_title", { id, title }),
  bookmarkSetTags: (id: string, tags: string[]) =>
    call<Bookmark>("bookmark_set_tags", { id, tags }),
  bookmarkTagsList: () => call<string[]>("bookmark_tags_list"),
  bookmarkTagCreate: (name: string) =>
    call<string[]>("bookmark_tag_create", { name }),
  bookmarkTagDelete: (name: string) =>
    call<string[]>("bookmark_tag_delete", { name }),
  bookmarkDelete: (id: string) => call<void>("bookmark_delete", { id }),
  bookmarkFetchMeta: (id: string) => call<Bookmark>("bookmark_fetch_meta", { id }),
  exportBookmarks: () => call<string | null>("export_bookmarks"),
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
  setTheme: (theme: Theme) => call<void>("set_theme", { theme }),
  setOutlineSound: (enabled: boolean) =>
    call<void>("set_outline_sound", { enabled }),
  getLanguage: () => call<Language>("get_language"),
  setLanguage: (language: Language) =>
    call<void>("set_language", { language }),

  settingsSnapshot: () => call<SettingsSnapshot>("get_settings"),
  openSettingsWindow: () => call<void>("open_settings_window"),
};
