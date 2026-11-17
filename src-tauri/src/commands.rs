use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::backlinks::{self, Backlink};
use crate::config::{self, DarkPalette, ImageUpload, ImageUploadMode, Language, LightPalette, PdfSettings, Theme, Typography};
use crate::error::{AppError, AppResult};
use crate::external_notes::ExternalNote;
use crate::graph;
use crate::history;
use crate::tags;
use crate::templates;
use crate::image_source::{self, ImagePayload};
use crate::mentions::{self, Mention};
use crate::search::SearchHit;
use crate::issues::{self, Issue, IssueStatus, Priority};
use crate::projects::{self, ProjectSummary};
use crate::tasks::{self, OpenTask};
use crate::vault::{self, TreeNode};
use crate::{agent_docs, assets, legacy, notes, search, upload};

#[derive(Default)]
pub struct AppState {
    vault: RwLock<Option<PathBuf>>,
    external: RwLock<HashSet<PathBuf>>,
    opened: RwLock<Vec<ExternalNote>>,
}

impl AppState {
    pub(crate) fn root(&self) -> AppResult<PathBuf> {
        self.vault
            .read()
            .map_err(|_| AppError::Other("state lock poisoned".to_string()))?
            .clone()
            .ok_or(AppError::NoVault)
    }

    fn set_root(&self, path: Option<PathBuf>) {
        if let Ok(mut guard) = self.vault.write() {
            *guard = path;
        }
    }

    pub(crate) fn allow_external(&self, path: PathBuf) -> AppResult<()> {
        self.external
            .write()
            .map_err(|_| AppError::Other("state lock poisoned".to_string()))?
            .insert(path);
        Ok(())
    }

    pub(crate) fn is_external_allowed(&self, path: &Path) -> AppResult<bool> {
        Ok(self
            .external
            .read()
            .map_err(|_| AppError::Other("state lock poisoned".to_string()))?
            .contains(path))
    }

    pub(crate) fn replace_external(&self, old: &Path, new: PathBuf) -> AppResult<()> {
        let mut external = self
            .external
            .write()
            .map_err(|_| AppError::Other("state lock poisoned".to_string()))?;
        external.remove(old);
        external.insert(new);
        Ok(())
    }

    pub(crate) fn revoke_external(&self, path: &Path) -> AppResult<()> {
        self.external
            .write()
            .map_err(|_| AppError::Other("state lock poisoned".to_string()))?
            .remove(path);
        Ok(())
    }

    pub(crate) fn queue_opened(&self, notes: Vec<ExternalNote>) -> AppResult<()> {
        self.opened
            .write()
            .map_err(|_| AppError::Other("state lock poisoned".to_string()))?
            .extend(notes);
        Ok(())
    }

    pub(crate) fn take_opened(&self) -> AppResult<Vec<ExternalNote>> {
        let mut opened = self
            .opened
            .write()
            .map_err(|_| AppError::Other("state lock poisoned".to_string()))?;
        Ok(std::mem::take(&mut *opened))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSnapshot {
    pub root: String,
    pub name: String,
    pub tree: Vec<TreeNode>,
    pub theme: Theme,
    pub light_palette: LightPalette,
    pub dark_palette: DarkPalette,
    pub outline_sound: bool,
    pub cursor_animation: bool,
    pub image_upload: ImageUpload,
}

fn snapshot(app: &AppHandle, root: &Path) -> AppResult<VaultSnapshot> {
    let tree = vault::scan_tree(root)?;
    let config = config::load(app);
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Vault".to_string());
    Ok(VaultSnapshot {
        root: root.display().to_string(),
        name,
        tree,
        theme: config.theme,
        light_palette: config.light_palette,
        dark_palette: config.dark_palette,
        outline_sound: config.outline_sound,
        cursor_animation: config.cursor_animation,
        image_upload: config.image_upload,
    })
}

fn activate_vault(app: &AppHandle, state: &AppState, root: PathBuf) -> AppResult<VaultSnapshot> {
    // Existing Markd vaults are migrated by ensure_layout and are not treated
    // as new, so their notes are never seeded or overwritten during rebrand.
    let first_run = !vault::has_data_dir(&root);
    vault::ensure_layout(&root)?;
    let _ = legacy::archive_collections(&root);
    // Drop in agent guide files so coding agents understand the vault.
    let _ = agent_docs::ensure(&root);
    // Seed a starter note only on a brand-new vault, so it isn't empty.
    if first_run {
        let _ = notes::seed_welcome(&root);
    }
    // Allow the webview to load images from the vault's asset folder.
    let _ = app
        .asset_protocol_scope()
        .allow_directory(root.join(vault::ASSETS_DIR), true);
    state.set_root(Some(root.clone()));
    // Push tree refreshes to the frontend when the vault changes on disk.
    crate::watcher::spawn(app.clone(), root.clone());
    crate::backup_commands::spawn_scheduler(app.clone(), root.clone());
    let mut cfg = config::load(app);
    cfg.vault_path = Some(root.display().to_string());
    config::save(app, &cfg)?;
    snapshot(app, &root)
}

/// Called once on app start: reopen the last vault if it still exists.
#[tauri::command]
pub fn startup(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<VaultSnapshot>> {
    let cfg = config::load(&app);
    let Some(path) = cfg.vault_path else {
        return Ok(None);
    };
    let root = PathBuf::from(path);
    if !root.is_dir() {
        return Ok(None);
    }
    activate_vault(&app, &state, root).map(Some)
}

/// Open a native folder picker and activate the chosen folder as the vault.
/// Async so the blocking dialog call runs off the main thread — calling it
/// on the main thread deadlocks the whole app.
#[tauri::command]
pub async fn choose_vault(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<VaultSnapshot>> {
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;

    let Some(folder) = picked else {
        return Ok(None);
    };
    let root = folder
        .into_path()
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    activate_vault(&app, &state, root).map(Some)
}

/// Prompt for a location + name, create that folder as a fresh vault, and
/// activate it. Async so the blocking save dialog runs off the main thread.
#[tauri::command]
pub async fn create_vault(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<VaultSnapshot>> {
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .set_file_name("Ornata Vault")
                .blocking_save_file()
        }
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;

    let Some(dest) = picked else {
        return Ok(None);
    };
    let root = dest
        .into_path()
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    std::fs::create_dir_all(&root)?;
    activate_vault(&app, &state, root).map(Some)
}

/// Run vault-wide work on the blocking pool. A sync command runs on the main
/// thread, so reading every note there would stall the whole app.
async fn off_main<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn load_tree(state: State<'_, AppState>) -> AppResult<Vec<TreeNode>> {
    let root = state.root()?;
    off_main(move || vault::scan_tree(&root)).await
}

// ---- notes ----

#[tauri::command]
pub fn read_note(state: State<'_, AppState>, rel: String) -> AppResult<String> {
    notes::read_note(&state.root()?, &rel)
}

#[tauri::command]
pub fn write_note(
    state: State<'_, AppState>,
    own: State<'_, crate::watcher::SelfWrites>,
    rel: String,
    content: String,
) -> AppResult<()> {
    let root = state.root()?;
    notes::write_note(&root, &rel, &content)?;
    own.record(&vault::resolve_rel(&root, &rel)?);
    Ok(())
}

#[tauri::command]
pub fn read_app_data(state: State<'_, AppState>, name: String) -> AppResult<Option<String>> {
    crate::app_data::read_data_file(&state.root()?, &name)
}

#[tauri::command]
pub fn write_app_data(
    state: State<'_, AppState>,
    name: String,
    content: String,
) -> AppResult<()> {
    crate::app_data::write_data_file(&state.root()?, &name, &content)
}

#[tauri::command]
pub fn list_templates(state: State<'_, AppState>) -> Vec<String> {
    match state.root() {
        Ok(root) => templates::list_templates(&root),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
pub fn read_template(state: State<'_, AppState>, name: String) -> AppResult<String> {
    templates::read_template(&state.root()?, &name)
}

#[tauri::command]
pub fn write_template(
    state: State<'_, AppState>,
    name: String,
    content: String,
) -> AppResult<()> {
    templates::write_template(&state.root()?, &name, &content)
}

#[tauri::command]
pub fn reveal_templates(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let dir = state
        .root()?
        .join(crate::vault::DATA_DIR)
        .join("templates");
    app.opener()
        .reveal_item_in_dir(dir)
        .map_err(|e| AppError::Other(format!("reveal: {e}")))
}

#[tauri::command]
pub async fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<tags::TagCount>> {
    let root = state.root()?;
    off_main(move || tags::list_tags(&root)).await
}

#[tauri::command]
pub async fn notes_with_tag(state: State<'_, AppState>, tag: String) -> AppResult<Vec<String>> {
    let root = state.root()?;
    off_main(move || tags::notes_with_tag(&root, &tag)).await
}

#[tauri::command]
pub async fn list_unused_assets(
    state: State<'_, AppState>,
) -> AppResult<Vec<assets::UnusedAsset>> {
    let root = state.root()?;
    off_main(move || assets::unreferenced_assets(&root)).await
}

#[tauri::command]
pub fn trash_assets(state: State<'_, AppState>, names: Vec<String>) -> AppResult<usize> {
    assets::trash_assets(&state.root()?, &names)
}

#[tauri::command]
pub async fn note_heads(
    state: State<'_, AppState>,
    rels: Vec<String>,
) -> AppResult<Vec<crate::previews::NoteHead>> {
    let root = state.root()?;
    off_main(move || crate::previews::note_heads(&root, &rels)).await
}

#[tauri::command]
pub async fn link_graph(state: State<'_, AppState>) -> AppResult<graph::LinkGraph> {
    let root = state.root()?;
    off_main(move || graph::link_graph(&root)).await
}

#[tauri::command]
pub fn note_history(state: State<'_, AppState>, rel: String) -> AppResult<Vec<history::SnapshotMeta>> {
    let root = state.root()?;
    // Reject traversal before history_dir joins rel under `.ornata/history/`.
    crate::vault::resolve_rel(&root, &rel)?;
    Ok(history::list_snapshots(&root, &rel))
}

#[tauri::command]
pub fn read_history_snapshot(
    state: State<'_, AppState>,
    rel: String,
    timestamp: i64,
) -> AppResult<String> {
    let root = state.root()?;
    crate::vault::resolve_rel(&root, &rel)?;
    history::read_snapshot(&root, &rel, timestamp)
}

/// Force a snapshot of the note's current disk content (used before a restore).
#[tauri::command]
pub fn snapshot_note(state: State<'_, AppState>, rel: String) -> AppResult<()> {
    let root = state.root()?;
    let path = crate::vault::resolve_rel(&root, &rel)?;
    let current = std::fs::read_to_string(path).unwrap_or_default();
    history::snapshot_note(&root, &rel, &current, true)
}

#[tauri::command]
pub fn create_note(state: State<'_, AppState>, dir: String, title: String) -> AppResult<String> {
    notes::create_note(&state.root()?, &dir, &title)
}

#[tauri::command]
pub fn create_folder(state: State<'_, AppState>, dir: String, name: String) -> AppResult<String> {
    notes::create_folder(&state.root()?, &dir, &name)
}

#[tauri::command]
pub fn rename_entry(
    state: State<'_, AppState>,
    rel: String,
    name: String,
) -> AppResult<notes::RenameOutcome> {
    notes::rename_entry(&state.root()?, &rel, &name)
}

#[tauri::command]
pub fn move_entry(
    state: State<'_, AppState>,
    rel: String,
    dir: String,
) -> AppResult<notes::RenameOutcome> {
    notes::move_entry(&state.root()?, &rel, &dir)
}

#[tauri::command]
pub fn delete_entry(state: State<'_, AppState>, rel: String) -> AppResult<()> {
    notes::delete_entry(&state.root()?, &rel)
}

#[tauri::command]
pub async fn search_notes(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> AppResult<Vec<SearchHit>> {
    let root = state.root()?;
    off_main(move || search::search_notes(&root, &query, limit.unwrap_or(30))).await
}

#[tauri::command]
pub async fn note_backlinks(state: State<'_, AppState>, rel: String) -> AppResult<Vec<Backlink>> {
    let root = state.root()?;
    off_main(move || backlinks::backlinks(&root, &rel)).await
}

#[tauri::command]
pub async fn unlinked_mentions(state: State<'_, AppState>, rel: String) -> AppResult<Vec<Mention>> {
    let root = state.root()?;
    off_main(move || mentions::unlinked_mentions(&root, &rel)).await
}

/// Link the plain mention of `target` on `line` of note `rel` to `href`.
#[tauri::command]
pub fn link_mention(
    state: State<'_, AppState>,
    rel: String,
    line: usize,
    text: String,
    target: String,
    href: String,
) -> AppResult<()> {
    mentions::link_mention(&state.root()?, &rel, line, &text, &target, &href)
}

#[tauri::command]
pub async fn open_tasks(state: State<'_, AppState>) -> AppResult<Vec<OpenTask>> {
    let root = state.root()?;
    off_main(move || tasks::open_tasks(&root)).await
}

#[tauri::command]
pub fn complete_task(
    state: State<'_, AppState>,
    rel: String,
    line: usize,
    text: String,
) -> AppResult<()> {
    tasks::complete_task(&state.root()?, &rel, line, &text)
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<ProjectSummary>> {
    let root = state.root()?;
    off_main(move || projects::list_projects(&root)).await
}

#[tauri::command]
pub async fn project_issues(state: State<'_, AppState>, rel: String) -> AppResult<Vec<Issue>> {
    let root = state.root()?;
    off_main(move || projects::project_issues(&root, &rel)).await
}

#[tauri::command]
pub fn set_project(app: AppHandle, state: State<'_, AppState>, rel: String, on: bool) -> AppResult<()> {
    let root = state.root()?;
    projects::set_project(&root, &rel, on)?;
    if on {
        let zh = config::load(&app).language == Language::SimplifiedChinese;
        templates::seed_project_templates(&root, zh)?;
    }
    Ok(())
}

#[tauri::command]
pub fn add_issue(
    state: State<'_, AppState>,
    project: String,
    text: String,
    status: Option<IssueStatus>,
) -> AppResult<String> {
    projects::add_issue(&state.root()?, &project, &text, status.unwrap_or(IssueStatus::Todo))
}

#[tauri::command]
pub fn create_issue_note(
    state: State<'_, AppState>,
    project: String,
    title: String,
    body: Option<String>,
) -> AppResult<String> {
    projects::create_issue_note(&state.root()?, &project, &title, body.as_deref().unwrap_or(""))
}

#[tauri::command]
pub fn replace_issue_text(
    state: State<'_, AppState>,
    rel: String,
    line: usize,
    text: String,
    new_text: String,
) -> AppResult<()> {
    issues::replace_issue_text(&state.root()?, &rel, line, &text, &new_text)
}

#[tauri::command]
pub fn set_issue_priority(
    state: State<'_, AppState>,
    rel: String,
    line: usize,
    text: String,
    priority: Option<Priority>,
) -> AppResult<()> {
    issues::set_issue_priority(&state.root()?, &rel, line, &text, priority, false)
}

#[tauri::command]
pub fn set_issue_status(
    state: State<'_, AppState>,
    rel: String,
    line: usize,
    text: String,
    status: IssueStatus,
) -> AppResult<()> {
    issues::set_issue_status(&state.root()?, &rel, line, &text, status, false)
}

#[tauri::command]
pub fn move_issue(
    state: State<'_, AppState>,
    rel: String,
    line: usize,
    text: String,
    target_line: usize,
    target_text: String,
    after: bool,
) -> AppResult<()> {
    crate::issue_move::move_issue(&state.root()?, &rel, line, &text, target_line, &target_text, after, false)
}

#[tauri::command]
pub fn remove_issue_notes(state: State<'_, AppState>, rel: String, line: usize, text: String) -> AppResult<usize> {
    crate::issue_move::remove_issue_notes(&state.root()?, &rel, line, &text)
}

#[tauri::command]
pub fn reopen_task(
    state: State<'_, AppState>,
    rel: String,
    line: usize,
    text: String,
) -> AppResult<()> {
    tasks::reopen_task(&state.root()?, &rel, line, &text)
}

/// Export the current note contents to a markdown file chosen by the user.
/// The frontend supplies its live editor contents so an in-flight autosave
/// cannot make the exported copy stale.
#[tauri::command]
pub async fn export_note(
    app: AppHandle,
    state: State<'_, AppState>,
    rel: String,
    content: String,
) -> AppResult<Option<String>> {
    // Validate that the source note still exists and `rel` stays in the vault.
    notes::read_note(&state.root()?, &rel)?;
    let file_name = PathBuf::from(&rel)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "note.md".to_string());

    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .set_file_name(file_name)
                .blocking_save_file()
        }
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;

    let Some(dest) = picked else {
        return Ok(None);
    };
    let path = dest
        .into_path()
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    std::fs::write(&path, content)?;
    crate::reveal::remember_export(&app, &path);
    Ok(Some(path.display().to_string()))
}

// ---- assets / misc ----

#[tauri::command]
pub fn save_image_asset(
    state: State<'_, AppState>,
    data: String,
    extension: String,
) -> AppResult<String> {
    let path = assets::save_image(&state.root()?, &data, &extension)?;
    Ok(path.display().to_string())
}

/// The current image-upload service settings.
#[tauri::command]
pub fn get_image_upload(app: AppHandle) -> ImageUpload {
    config::load(&app).image_upload
}

#[tauri::command]
pub fn get_pdf_settings(app: AppHandle) -> PdfSettings {
    config::load(&app).pdf
}

#[tauri::command]
pub fn set_pdf_settings(app: AppHandle, pdf: PdfSettings) -> AppResult<()> {
    let mut cfg = config::load(&app);
    cfg.pdf = pdf;
    config::save(&app, &cfg)
}

#[tauri::command]
pub fn get_typography(app: AppHandle) -> Typography {
    config::load(&app).typography
}

#[tauri::command]
pub fn set_typography(app: AppHandle, typography: Typography) -> AppResult<()> {
    let mut cfg = config::load(&app);
    cfg.typography = typography;
    config::save(&app, &cfg)
}

#[tauri::command]
pub fn set_image_upload(app: AppHandle, upload: ImageUpload) -> AppResult<()> {
    let mut cfg = config::load(&app);
    cfg.image_upload.mode = upload.mode;
    // Keep the command even when the mode is off so toggling back restores it.
    cfg.image_upload.command = upload.command.trim().to_string();
    config::save(&app, &cfg)
}

/// Run one image through the configured upload command and return the hosted
/// URL. Used both by paste-upload and the settings "verify" button (which
/// passes its own command to preview the result before saving). Async so
/// Tauri runs it off the main thread — the upload blocks up to 60s and must
/// never stall the UI.
#[tauri::command]
pub async fn upload_image(
    app: AppHandle,
    data: String,
    extension: String,
    command: Option<String>,
) -> AppResult<String> {
    let configured = config::load(&app).image_upload;
    let command = match command {
        Some(explicit) => explicit,
        None if configured.mode == ImageUploadMode::Custom => configured.command,
        None => return Err(AppError::InvalidInput("upload service is off".into())),
    };
    tauri::async_runtime::spawn_blocking(move || {
        upload::upload_image(&data, &extension, &command)
    })
    .await
    .map_err(|e| AppError::Network(format!("upload task failed: {e}")))?
}

/// Load an image shown in the editor (absolute local path or http(s) URL) as
/// a data URL — backs the image context menu's re-upload and copy actions.
#[tauri::command]
pub async fn read_image(source: String) -> AppResult<ImagePayload> {
    Ok(image_source::load(&source).await?.into_payload())
}

/// "Save image as": prompt for a destination and write the image bytes.
/// Async so the blocking save dialog runs off the main thread. Returns the
/// written path, or None if the user cancelled.
#[tauri::command]
pub async fn save_image_as(app: AppHandle, source: String) -> AppResult<Option<String>> {
    let image = image_source::load(&source).await?;
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        let file_name = image.file_name.clone();
        move || app.dialog().file().set_file_name(file_name).blocking_save_file()
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;

    let Some(dest) = picked else {
        return Ok(None);
    };
    let path = dest
        .into_path()
        .map_err(|e| AppError::InvalidPath(e.to_string()))?;
    std::fs::write(&path, image.bytes)?;
    Ok(Some(path.display().to_string()))
}

/// Open a local image file in the system's default viewer. Remote images are
/// opened by the frontend through the opener plugin's URL scope.
#[tauri::command]
pub fn open_local_image(path: String) -> AppResult<()> {
    let path = image_source::local_path(&path)?;
    tauri_plugin_opener::open_path(path, None::<&str>)
        .map_err(|error| AppError::Other(error.to_string()))
}

#[tauri::command]
pub fn set_theme(app: AppHandle, theme: Theme) -> AppResult<()> {
    let mut cfg = config::load(&app);
    cfg.theme = theme;
    config::save(&app, &cfg)
}

#[tauri::command]
pub fn set_light_palette(app: AppHandle, palette: LightPalette) -> AppResult<()> {
    let mut cfg = config::load(&app);
    cfg.light_palette = palette;
    config::save(&app, &cfg)
}

#[tauri::command]
pub fn set_dark_palette(app: AppHandle, palette: DarkPalette) -> AppResult<()> {
    let mut cfg = config::load(&app);
    cfg.dark_palette = palette;
    config::save(&app, &cfg)
}

#[tauri::command]
pub fn set_outline_sound(app: AppHandle, enabled: bool) -> AppResult<()> {
    let mut cfg = config::load(&app);
    cfg.outline_sound = enabled;
    config::save(&app, &cfg)
}

#[tauri::command]
pub fn set_cursor_animation(app: AppHandle, enabled: bool) -> AppResult<()> {
    let mut cfg = config::load(&app);
    cfg.cursor_animation = enabled;
    config::save(&app, &cfg)
}

#[tauri::command]
pub fn get_language(app: AppHandle) -> Language {
    config::load(&app).language
}

#[tauri::command]
pub fn set_language(app: AppHandle, language: Language) -> AppResult<()> {
    let mut cfg = config::load(&app);
    cfg.language = language;
    config::save(&app, &cfg)
}
