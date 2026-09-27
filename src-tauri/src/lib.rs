mod agent;
mod app_data;
mod agent_connection;
mod agent_docs;
mod agent_tools;
mod assets;
mod backlinks;
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
mod watcher;

use commands::AppState;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
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
        .manage(agent::AgentState::default())
        .manage(print_export::PrintState::default())
        .invoke_handler(tauri::generate_handler![
            agent::agent_status,
            agent::agent_start,
            agent::agent_send,
            agent::agent_set_permission,
            agent::agent_abort,
            agent::agent_respond_approval,
            agent::agent_providers_list,
            agent::agent_models_list,
            agent::agent_oauth_start,
            agent::agent_oauth_respond,
            agent::agent_oauth_cancel,
            agent::agent_stop,
            agent_connection::agent_connections_list,
            agent_connection::agent_connection_get,
            agent_connection::agent_connection_save,
            agent_connection::agent_connection_activate,
            agent_connection::agent_connection_delete,
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
            commands::search_notes,
            commands::note_backlinks,
            commands::unlinked_mentions,
            commands::link_mention,
            commands::open_tasks,
            commands::complete_task,
            commands::export_note,
            external_notes::export_external_note,
            commands::save_image_asset,
            commands::get_image_upload,
            commands::set_image_upload,
            commands::upload_image,
            commands::read_image,
            commands::save_image_as,
            commands::open_local_image,
            commands::set_theme,
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
            if let Err(err) = app.global_shortcut().register("cmd+alt+j") {
                eprintln!("global shortcut cmd+alt+j unavailable: {err}");
            }
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
            let state = app.state::<AppState>();
            let notes = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .filter_map(|path| external_notes::authorize(app, &state, path).ok())
                .collect::<Vec<_>>();
            if notes.is_empty() {
                return;
            }
            let _ = state.queue_opened(notes.clone());
            let _ = app.emit("open-markdown", notes);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}
