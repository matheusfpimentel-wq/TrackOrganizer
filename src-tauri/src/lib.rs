mod commands;
mod model;
mod scan;
mod tags;

/// Tauri application entry point (shared by desktop & mobile bins).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::scan_folder,
            commands::read_tags,
            commands::write_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tracklistr");
}
