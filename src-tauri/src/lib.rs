mod agent;
mod agent_connection;
mod agent_docs;
mod agent_tools;
mod assets;
mod bookmarks;
mod commands;
mod config;
mod error;
mod external_notes;
mod link_meta;
mod notes;
mod reveal;
mod search;
mod settings_window;
mod todos;
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
        .manage(AppState::default())
        .manage(agent::AgentState::default())
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
            commands::create_note,
            commands::create_folder,
            commands::rename_entry,
            commands::move_entry,
            commands::delete_entry,
            reveal::reveal_entry,
            commands::search_notes,
            commands::todos_list,
            commands::todo_add,
            commands::todo_toggle,
            commands::todo_update,
            commands::todo_set_tags,
            commands::todo_tags_list,
            commands::todo_tag_create,
            commands::todo_tag_delete,
            commands::todo_delete,
            commands::todos_clear_completed,
            commands::bookmarks_list,
            commands::bookmark_add,
            commands::bookmark_update_title,
            commands::bookmark_set_tags,
            commands::bookmark_tags_list,
            commands::bookmark_tag_create,
            commands::bookmark_tag_delete,
            commands::bookmark_delete,
            commands::bookmark_fetch_meta,
            commands::export_bookmarks,
            commands::export_note,
            external_notes::export_external_note,
            commands::save_image_asset,
            commands::get_image_upload,
            commands::set_image_upload,
            commands::upload_image,
            commands::set_theme,
            commands::set_outline_sound,
            commands::get_language,
            commands::set_language,
            settings_window::get_settings,
            settings_window::open_settings_window,
        ])
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
