use crate::model::ScannedTrack;
use crate::scan;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::fs;
use std::path::{Path, PathBuf};

/// Percent-decode a string (e.g. file URI segments).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(h) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(h);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// Turn a rekordbox `Location` URI into a filesystem path.
fn decode_location(loc: &str) -> String {
    let stripped = loc
        .strip_prefix("file://localhost")
        .or_else(|| loc.strip_prefix("file://"))
        .unwrap_or(loc);
    let decoded = percent_decode(stripped);
    // On Windows a URI path looks like "/C:/Music/x.mp3"; drop the leading slash.
    #[cfg(windows)]
    {
        if decoded.len() >= 3 && decoded.starts_with('/') && decoded.as_bytes()[2] == b':' {
            return decoded[1..].to_string();
        }
    }
    decoded
}

/// Import a rekordbox collection XML: extract every TRACK `Location` and read
/// the referenced files from disk into our model.
pub fn import_rekordbox_xml(path: &str) -> Result<Vec<ScannedTrack>, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("ler XML: {e}"))?;
    let mut reader = Reader::from_str(&content);
    let mut buf = Vec::new();
    let mut out = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                if e.name().as_ref() == b"TRACK" {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"Location" {
                            let raw = attr.unescape_value().unwrap_or_default().to_string();
                            let p = decode_location(&raw);
                            out.push(scan::scanned_track(Path::new(&p)));
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("parse XML: {e}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(out)
}

/// Import an M3U/M3U8 playlist: each non-comment line is a track path
/// (relative paths are resolved against the playlist's folder).
pub fn import_m3u(path: &str) -> Result<Vec<ScannedTrack>, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("ler M3U: {e}"))?;
    let base = Path::new(path).parent().map(Path::to_path_buf).unwrap_or_default();
    let mut out = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let candidate = PathBuf::from(trimmed);
        let resolved = if candidate.is_absolute() { candidate } else { base.join(trimmed) };
        out.push(scan::scanned_track(&resolved));
    }

    Ok(out)
}
