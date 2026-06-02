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

/// Recursively scan `root` for supported audio files.
///
/// Unreadable files are included with their `error` set rather than aborting
/// the whole scan, so the user still sees them in the grid.
pub fn scan_folder(root: &str) -> Vec<ScannedTrack> {
    let mut out = Vec::new();

    for entry in WalkDir::new(root).follow_links(false).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !entry.file_type().is_file() || !is_audio(path) {
            continue;
        }

        let file_path = path.to_string_lossy().to_string();
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let format = extension(path).unwrap_or_default();

        let (tags, error) = match tags::read_tags(&file_path) {
            Ok(t) => (t, None),
            Err(e) => (Default::default(), Some(e)),
        };

        out.push(ScannedTrack {
            id: stable_id(&file_path),
            file_path: file_path.clone(),
            file_name,
            format,
            has_artwork: error.is_none() && tags::has_artwork(&file_path),
            tags,
            error,
        });
    }

    out.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));
    out
}
