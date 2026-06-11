use crate::model::{
    Cue, DeepScanResult, DupGroup, ScannedTrack, StructureResult, TrackTags, WriteOutcome,
    WriteRequest, WriteResult,
};
use crate::{deepscan, import, scan, serato, tags};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

/// Recursively scan a folder and read tags. Per-file errors are embedded in
/// each `ScannedTrack`, so this command itself does not fail.
#[tauri::command]
pub fn scan_folder(path: String, recursive: bool) -> Vec<ScannedTrack> {
    scan::scan_folder(&path, recursive)
}

/// Streaming + parallel scan: returns the total count immediately and emits
/// `scan-batch` (Vec<ScannedTrack>) events as files are parsed in parallel,
/// then `scan-done`. Keeps the UI responsive for huge libraries.
#[tauri::command]
pub fn scan_folder_stream(app: tauri::AppHandle, path: String, recursive: bool) -> usize {
    use rayon::prelude::*;
    use tauri::Emitter;

    let paths = scan::collect_audio_paths(&path, recursive);
    let total = paths.len();

    std::thread::spawn(move || {
        const CHUNK: usize = 128;
        for chunk in paths.chunks(CHUNK) {
            let tracks: Vec<ScannedTrack> =
                chunk.par_iter().map(|p| scan::scanned_track(p)).collect();
            let _ = app.emit("scan-batch", tracks);
        }
        let _ = app.emit("scan-done", total);
    });

    total
}

/// Re-read a single file's tags from disk.
#[tauri::command]
pub fn read_tags(path: String) -> Result<TrackTags, String> {
    tags::read_tags(&path)
}

/// First embedded artwork as a `data:` URL (for thumbnails), if any.
#[tauri::command]
pub fn get_artwork(path: String) -> Option<String> {
    tags::read_artwork(&path)
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

/// Rename a file on disk to `new_base` + original extension (same folder).
/// Returns the new absolute path. Refuses to overwrite an existing file.
#[tauri::command]
pub fn rename_file(path: String, new_base: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    let dir = p.parent().ok_or("sem diretório")?;
    let ext = p.extension().and_then(|e| e.to_str());

    // Sanitize: drop path separators and characters illegal on Win/macOS.
    let mut base: String = new_base
        .chars()
        .map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    base = base.trim().trim_matches('.').to_string();
    if base.is_empty() {
        return Err("nome vazio".into());
    }

    let file_name = match ext {
        Some(e) => format!("{base}.{e}"),
        None => base,
    };
    let dest = dir.join(&file_name);
    if dest == p {
        return Ok(path);
    }
    if dest.exists() {
        return Err(format!("já existe um arquivo chamado {file_name}"));
    }
    fs::rename(p, &dest).map_err(|e| format!("renomear: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
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

/// Write cues into an MP3 as Serato Markers2 (backs up the file first).
#[tauri::command]
pub fn write_serato_cues(path: String, cues: Vec<Cue>) -> Result<String, String> {
    // Full-file backup before touching the audio file.
    let backup_dir = std::env::temp_dir().join("tracklistr").join("serato-backups");
    fs::create_dir_all(&backup_dir).map_err(|e| format!("backup dir: {e}"))?;
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "track".into());
    let backup = backup_dir.join(format!("{}-{}.bak", timestamp(), name));
    fs::copy(&path, &backup).map_err(|e| format!("backup: {e}"))?;

    serato::write_serato_cues(&path, &cues)?;
    Ok(backup.to_string_lossy().to_string())
}

/// Build and write a Serato `.crate` playlist file to `dest`.
#[tauri::command]
pub fn export_serato_crate(dest: String, paths: Vec<String>) -> Result<(), String> {
    let bytes = serato::build_crate(&paths);
    fs::write(&dest, bytes).map_err(|e| format!("gravar crate: {e}"))
}
