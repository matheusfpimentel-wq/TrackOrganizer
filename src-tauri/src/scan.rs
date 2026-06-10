use crate::model::ScannedTrack;
use crate::tags;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;
use walkdir::WalkDir;

const AUDIO_EXTS: &[&str] = &["mp3", "m4a", "mp4", "flac", "wav", "aiff", "aif", "ogg", "opus"];

fn stable_id(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
}

fn is_audio(path: &Path) -> bool {
    extension(path).is_some_and(|ext| AUDIO_EXTS.contains(&ext.as_str()))
}

/// Read a single file into a `ScannedTrack`. Unreadable files come back with
/// `error` set (and default tags) rather than failing.
pub fn scanned_track(path: &Path) -> ScannedTrack {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let format = extension(path).unwrap_or_default();

    let (tags, duration_secs, has_artwork, error) = if !path.is_file() {
        (Default::default(), None, false, Some("arquivo não encontrado".to_string()))
    } else {
        match tags::read_meta(&file_path) {
            Ok((t, dur, art)) => (t, dur, art, None),
            Err(e) => (Default::default(), None, false, Some(e)),
        }
    };

    ScannedTrack {
        id: stable_id(&file_path),
        file_path: file_path.clone(),
        file_name,
        format,
        has_artwork,
        duration_secs,
        tags,
        error,
    }
}

/// Collect the audio file paths under `root` (sorted by file name), without
/// parsing them — used to drive a parallel/streaming scan.
pub fn collect_audio_paths(root: &str, recursive: bool) -> Vec<std::path::PathBuf> {
    let mut paths: Vec<std::path::PathBuf> = WalkDir::new(root)
        .follow_links(false)
        .max_depth(if recursive { usize::MAX } else { 1 })
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && is_audio(e.path()))
        .map(|e| e.into_path())
        .collect();
    paths.sort_by_key(|p| {
        p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default()
    });
    paths
}

/// Recursively scan `root` for supported audio files.
///
/// Unreadable files are included with their `error` set rather than aborting
/// the whole scan, so the user still sees them in the grid.
pub fn scan_folder(root: &str, recursive: bool) -> Vec<ScannedTrack> {
    let mut out = Vec::new();

    let walker = WalkDir::new(root)
        .follow_links(false)
        .max_depth(if recursive { usize::MAX } else { 1 });
    for entry in walker.into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !entry.file_type().is_file() || !is_audio(path) {
            continue;
        }
        out.push(scanned_track(path));
    }

    out.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));
    out
}
