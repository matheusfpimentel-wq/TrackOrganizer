mod ai;
mod commands;
mod config;
mod deepscan;
mod import;
mod model;
mod scan;
mod serato;
mod tags;

/// Tauri application entry point (shared by desktop & mobile bins).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::scan_folder,
            commands::scan_folder_stream,
            commands::read_tags,
            commands::get_artwork,
            commands::write_tags,
            commands::undo_write,
            commands::write_text_file,
            commands::reveal_in_files,
            commands::import_rekordbox_xml,
            commands::import_m3u,
            commands::deep_scan,
            commands::find_audio_duplicates,
            commands::detect_cues,
            commands::write_serato_cues,
            commands::export_serato_crate,
            config::get_config,
            config::update_config,
            config::clear_api_key,
            ai::tag_with_ai,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tracklistr");
}
