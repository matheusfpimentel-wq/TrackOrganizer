use crate::model::{
    DeepScanResult, DupGroup, ScannedTrack, StructureResult, TrackTags, WriteOutcome, WriteRequest,
    WriteResult,
};
use crate::{deepscan, import, scan, tags};
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

/// Reveal a file in the OS file manager (Finder / Explorer / default).
#[tauri::command]
pub fn reveal_in_files(path: String) -> Result<(), String> {
    use std::process::Command;
    let result = {
        #[cfg(target_os = "macos")]
        {
            Command::new("open").arg("-R").arg(&path).spawn()
        }
        #[cfg(target_os = "windows")]
        {
            Command::new("explorer").arg(format!("/select,{path}")).spawn()
        }
        #[cfg(target_os = "linux")]
        {
            let dir = std::path::Path::new(&path)
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_default();
            Command::new("xdg-open").arg(dir).spawn()
        }
    };
    result.map(|_| ()).map_err(|e| format!("revelar arquivo: {e}"))
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

/// Deep per-track audio analysis (spectral cutoff / fake-320 heuristic).
#[tauri::command]
pub fn deep_scan(path: String) -> Result<DeepScanResult, String> {
    deepscan::analyze(&path)
}

/// Cluster files that share the same audio via acoustic fingerprint.
#[tauri::command]
pub fn find_audio_duplicates(paths: Vec<String>) -> Result<Vec<DupGroup>, String> {
    deepscan::find_audio_duplicates(&paths)
}

/// Detect structural cue points (intro / drops / breaks / outro) for a track.
#[tauri::command]
pub fn detect_cues(path: String) -> Result<StructureResult, String> {
    deepscan::detect_cues(&path)
}
