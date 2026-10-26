import { invoke } from "@tauri-apps/api/core";
import type { OutlineEntry } from "./pdfOutline";
import type {
  ExternalNote,
  ImageUpload,
  PdfSettings,
  Language,
  SearchHit,
  Backlink,
  CliAccess,
  McpInstallOutcome,
  McpStatus,
  Mention,
  RenameOutcome,
  SnapshotMeta,
  LinkGraph,
  TagCount,
  UnusedAsset,
  OpenTask,
  Issue,
  IssuePriority,
  IssueStatus,
  ProjectSummary,
  SettingsSnapshot,
  BackupInfo,
  DarkPalette,
  LightPalette,
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
  startPrintExport: (input: {
    markdown: string;
    vaultRoot: string;
    defaultName: string;
    kind: "pdf" | "html" | "clipboard";
  }) =>
    call<void>("start_print_export", {
      markdown: input.markdown,
      vaultRoot: input.vaultRoot,
      defaultName: input.defaultName,
      kind: input.kind,
    }),
  hidePrintWindow: () => call<void>("hide_print_window"),
  currentPrintJob: () =>
    call<{ id: number; markdown: string; vaultRoot: string; pageMarginMm: number | null } | null>(
      "current_print_job",
    ),
  printViewReady: (input: {
    id: number;
    bodyHtml: string;
    pageCss: string;
    /** Bookmark outline for PDF exports (see lib/pdfOutline). */
    headings: OutlineEntry[];
  }) =>
    call<void>("print_view_ready", input),
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
  /** Only files exported this session (the backend refuses anything else). */
  revealExport: (path: string) => call<void>("reveal_export", { path }),
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

  reopenTask: (rel: string, line: number, text: string) =>
    call<void>("reopen_task", { rel, line, text }),

  listProjects: () => call<ProjectSummary[]>("list_projects"),
  projectIssues: (rel: string) => call<Issue[]>("project_issues", { rel }),
  setProject: (rel: string, on: boolean) => call<void>("set_project", { rel, on }),
  setIssuePriority: (rel: string, line: number, text: string, priority: IssuePriority | null) =>
    call<void>("set_issue_priority", { rel, line, text, priority }),
  setIssueStatus: (rel: string, line: number, text: string, status: IssueStatus) =>
    call<void>("set_issue_status", { rel, line, text, status }),

  addIssue: (project: string, text: string, status?: IssueStatus) =>
    call<string>("add_issue", { project, text, status }),
  createIssueNote: (project: string, title: string, body?: string) =>
    call<string>("create_issue_note", { project, title, body }),
  replaceIssueText: (rel: string, line: number, text: string, newText: string) =>
    call<void>("replace_issue_text", { rel, line, text, newText }),

  exportNote: (rel: string, content: string) =>
    call<string | null>("export_note", { rel, content }),
  exportExternalNote: (path: string, content: string) =>
    call<string | null>("export_external_note", { path, content }),

  saveImageAsset: (data: string, extension: string) =>
    call<string>("save_image_asset", { data, extension }),
  getImageUpload: () => call<ImageUpload>("get_image_upload"),
  getPdfSettings: () => call<PdfSettings>("get_pdf_settings"),
  setPdfSettings: (pdf: PdfSettings) => call<void>("set_pdf_settings", { pdf }),
  setImageUpload: (upload: ImageUpload) =>
    call<void>("set_image_upload", { upload }),
  uploadImage: (data: string, extension: string, command?: string) =>
    call<string>("upload_image", { data, extension, command }),
  readImage: (source: string) =>
    call<{ data: string; extension: string }>("read_image", { source }),
  saveImageAs: (source: string) =>
    call<string | null>("save_image_as", { source }),
  openLocalImage: (path: string) => call<void>("open_local_image", { path }),
  getBackup: () => call<BackupInfo>("get_backup"),
  setBackupFolder: (folder: string | null) =>
    call<BackupInfo>("set_backup_folder", { folder }),
  chooseBackupFolder: () => call<BackupInfo | null>("choose_backup_folder"),
  runBackupNow: () => call<BackupInfo>("run_backup_now"),
  revealBackupFolder: () => call<void>("reveal_backup_folder"),
  setTheme: (theme: Theme) => call<void>("set_theme", { theme }),
  setLightPalette: (palette: LightPalette) =>
    call<void>("set_light_palette", { palette }),
  setDarkPalette: (palette: DarkPalette) =>
    call<void>("set_dark_palette", { palette }),
  setOutlineSound: (enabled: boolean) =>
    call<void>("set_outline_sound", { enabled }),
  setCursorAnimation: (enabled: boolean) =>
    call<void>("set_cursor_animation", { enabled }),
  getLanguage: () => call<Language>("get_language"),
  setLanguage: (language: Language) =>
    call<void>("set_language", { language }),

  mcpStatus: () => call<McpStatus>("mcp_status"),
  mcpSetAccess: (access: CliAccess) => call<void>("mcp_set_access", { access }),
  mcpServerStart: () => call<void>("mcp_server_start"),
  mcpServerStop: () => call<void>("mcp_server_stop"),
  mcpRotateToken: () => call<void>("mcp_rotate_token"),
  mcpInstallCli: () => call<McpInstallOutcome>("mcp_install_cli"),
  mcpUninstallCli: () => call<void>("mcp_uninstall_cli"),

  settingsSnapshot: () => call<SettingsSnapshot>("get_settings"),
  openSettingsWindow: () => call<void>("open_settings_window"),
};
