mod app_data;
mod agent_docs;
mod agent_tools;
mod assets;
mod backup;
mod backup_commands;
mod backlinks;
mod cli;
mod commands;
mod config;
mod error;
mod external_notes;
mod graph;
mod history;
mod link_rewrite;
mod image_source;
mod legacy;
mod mentions;
mod notes;
#[cfg(target_os = "macos")]
mod pdf_export;
#[cfg(target_os = "macos")]
mod pdf_outline;
mod print_export;
mod quick_capture;
mod reveal;
mod search;
mod tags;
mod templates;
mod tasks;
mod settings_window;
mod upload;
mod util;
mod vault;
mod vault_guard;
mod watcher;

use commands::AppState;
use tauri::{Emitter, Manager};

/// Runs a command-line subcommand (`ornata mcp`, `ornata search …`) when the
/// executable was started with one; `None` means start the app.
pub fn try_cli() -> Option<i32> {
    cli::try_run()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // A second launch (e.g. double-clicking another .md) hands its files to
    // the running window instead of starting another app. Must be first.
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        open_external(app, launch_paths(args));
    }));
    let app = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            // Only react to the press, not the release.
            if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                if let Err(err) = quick_capture::toggle(app) {
                    eprintln!("quick capture: {err}");
                }
            }
        }).build())
        .manage(AppState::default())
        .manage(watcher::SelfWrites::default())
        .manage(backup_commands::BackupGuard::default())
        .manage(cli::app_api::McpServer::default())
        .manage(print_export::PrintState::default())
        .manage(reveal::ExportedFiles::default())
        .invoke_handler(tauri::generate_handler![
            cli::app_api::mcp_status,
            cli::app_api::mcp_set_access,
            cli::app_api::mcp_server_start,
            cli::app_api::mcp_server_stop,
            cli::app_api::mcp_rotate_token,
            cli::app_api::mcp_install_cli,
            cli::app_api::mcp_uninstall_cli,
            commands::startup,
            commands::choose_vault,
            commands::create_vault,
            commands::load_tree,
            external_notes::choose_external_notes,
            external_notes::authorize_external_notes,
            external_notes::take_opened_external_notes,
            external_notes::read_external_note,
            external_notes::write_external_note,
            external_notes::rename_external_note,
            external_notes::delete_external_note,
            external_notes::save_external_image,
            external_notes::open_external_link,
            commands::read_note,
            commands::write_note,
            commands::read_app_data,
            commands::write_app_data,
            commands::list_templates,
            commands::read_template,
            commands::write_template,
            commands::reveal_templates,
            commands::list_tags,
            commands::notes_with_tag,
            commands::note_history,
            commands::list_unused_assets,
            commands::link_graph,
            quick_capture::toggle_quick_capture,
            quick_capture::submit_quick_capture,
            quick_capture::dismiss_quick_capture,
            print_export::start_print_export,
            print_export::current_print_job,
            print_export::print_view_ready,
            print_export::hide_print_window,
            commands::trash_assets,
            commands::read_history_snapshot,
            commands::snapshot_note,
            commands::create_note,
            commands::create_folder,
            commands::rename_entry,
            commands::move_entry,
            commands::delete_entry,
            reveal::reveal_entry,
            reveal::reveal_export,
            commands::search_notes,
            commands::note_backlinks,
            commands::unlinked_mentions,
            commands::link_mention,
            commands::open_tasks,
            commands::complete_task,
            commands::reopen_task,
            commands::export_note,
            external_notes::export_external_note,
            commands::save_image_asset,
            commands::get_image_upload,
            commands::set_image_upload,
            commands::get_pdf_settings,
            commands::set_pdf_settings,
            commands::upload_image,
            commands::read_image,
            commands::save_image_as,
            commands::open_local_image,
            commands::set_theme,
            commands::set_light_palette,
            commands::set_dark_palette,
            backup_commands::get_backup,
            backup_commands::set_backup_folder,
            backup_commands::choose_backup_folder,
            backup_commands::run_backup_now,
            backup_commands::reveal_backup_folder,
            commands::set_outline_sound,
            commands::set_cursor_animation,
            commands::get_language,
            commands::set_language,
            settings_window::get_settings,
            settings_window::open_settings_window,
        ])
        .setup(|app| {
            // The global shortcut is best-effort: registration can fail on a
            // conflict or missing permission, and the app stays fully usable
            // (the capture window remains reachable in-app if we add one).
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            let shortcut = if cfg!(target_os = "macos") { "cmd+alt+j" } else { "ctrl+alt+j" };
            if let Err(err) = app.global_shortcut().register(shortcut) {
                eprintln!("global shortcut {shortcut} unavailable: {err}");
            }
            #[cfg(windows)]
            open_external(app.handle(), launch_paths(std::env::args()));
            // The MCP server comes back up if it was left on.
            cli::app_api::autostart(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window quits the whole app — the quick-capture
            // window is not a standalone writer and must not outlive it.
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    window.app_handle().exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            open_external(app, urls.into_iter().filter_map(|url| url.to_file_path().ok()).collect());
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}

/// Authorize markdown files handed to the app by the OS (macOS open events,
/// Windows launch arguments) and bring them up in the main window.
#[cfg(any(target_os = "macos", windows))]
fn open_external(app: &tauri::AppHandle, paths: Vec<std::path::PathBuf>) {
    let state = app.state::<AppState>();
    let notes = paths
        .into_iter()
        .filter_map(|path| external_notes::authorize(app, &state, path).ok())
        .collect::<Vec<_>>();
    if notes.is_empty() {
        return;
    }
    let _ = state.queue_opened(notes.clone());
    let _ = app.emit("open-markdown", notes);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(windows)]
fn launch_paths(args: impl IntoIterator<Item = String>) -> Vec<std::path::PathBuf> {
    args.into_iter().skip(1).map(std::path::PathBuf::from).collect()
}
