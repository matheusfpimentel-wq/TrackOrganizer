use crate::model::{ScannedTrack, TrackTags, WriteOutcome, WriteRequest, WriteResult};
use crate::{import, scan, tags};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

/// Recursively scan a folder and read tags. Per-file errors are embedded in
/// each `ScannedTrack`, so this command itself does not fail.
#[tauri::command]
pub fn scan_folder(path: String) -> Vec<ScannedTrack> {
    scan::scan_folder(&path)
}

/// Re-read a single file's tags from disk.
#[tauri::command]
pub fn read_tags(path: String) -> Result<TrackTags, String> {
    tags::read_tags(&path)
}

fn timestamp() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Persist approved tags back to disk.
///
/// Before touching any file, the *current* on-disk tags are snapshotted to a
/// timestamped JSON backup (enabling "undo last write"). Each file is written
/// independently; a failure on one does not abort the others.
#[tauri::command]
pub fn write_tags(items: Vec<WriteRequest>) -> Result<WriteOutcome, String> {
    // 1) Snapshot originals for backup / undo.
    let mut backup: Vec<WriteRequest> = Vec::with_capacity(items.len());
    for item in &items {
        if let Ok(current) = tags::read_tags(&item.file_path) {
            backup.push(WriteRequest { file_path: item.file_path.clone(), tags: current });
        }
    }

    let backup_dir = std::env::temp_dir().join("tracklistr").join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| format!("backup dir: {e}"))?;
    let backup_path = backup_dir.join(format!("tags-{}.json", timestamp()));
    let json = serde_json::to_string_pretty(&backup).map_err(|e| format!("serialize backup: {e}"))?;
    fs::write(&backup_path, json).map_err(|e| format!("write backup: {e}"))?;

    // 2) Write each file, collecting per-file results.
    let results: Vec<WriteResult> = items
        .iter()
        .map(|item| match tags::write_tags(&item.file_path, &item.tags) {
            Ok(()) => WriteResult { file_path: item.file_path.clone(), ok: true, error: None },
            Err(e) => WriteResult { file_path: item.file_path.clone(), ok: false, error: Some(e) },
        })
        .collect();

    Ok(WriteOutcome { backup_path: backup_path.to_string_lossy().to_string(), results })
}

/// Restore tags from a backup JSON produced by `write_tags` (undo last write).
#[tauri::command]
pub fn undo_write(backup_path: String) -> Result<WriteOutcome, String> {
    let text = fs::read_to_string(&backup_path).map_err(|e| format!("ler backup: {e}"))?;
    let items: Vec<WriteRequest> =
        serde_json::from_str(&text).map_err(|e| format!("parse backup: {e}"))?;

    let results: Vec<WriteResult> = items
        .iter()
        .map(|item| match tags::write_tags(&item.file_path, &item.tags) {
            Ok(()) => WriteResult { file_path: item.file_path.clone(), ok: true, error: None },
            Err(e) => WriteResult { file_path: item.file_path.clone(), ok: false, error: Some(e) },
        })
        .collect();

    Ok(WriteOutcome { backup_path, results })
}

/// Write a UTF-8 text file to an absolute path (used for setlist/playlist export).
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("escrever arquivo: {e}"))
}

/// Import a rekordbox collection XML into our track model.
#[tauri::command]
pub fn import_rekordbox_xml(path: String) -> Result<Vec<ScannedTrack>, String> {
    import::import_rekordbox_xml(&path)
}

/// Import an M3U/M3U8 playlist into our track model.
#[tauri::command]
pub fn import_m3u(path: String) -> Result<Vec<ScannedTrack>, String> {
    import::import_m3u(&path)
}
