use crate::model::TrackTags;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lofty::config::WriteOptions;
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::Tag;

/// Energy is stored inside the comment (per project decision). Convention:
/// the user comment, optionally followed by ` | Energy: N` (N in 1..5).

/// Split a stored comment into (user comment, energy) on read.
fn split_energy(comment: &str) -> (String, Option<u8>) {
    let lower = comment.to_lowercase();
    if let Some(pos) = lower.rfind("energy") {
        let after = &comment[pos + "energy".len()..];
        if let Some(n) = after
            .chars()
            .find(|c| c.is_ascii_digit())
            .and_then(|c| c.to_digit(10))
        {
            if (1..=5).contains(&n) {
                let prefix = comment[..pos].trim_end().trim_end_matches(['|', '-', ',', ';']).trim_end();
                return (prefix.to_string(), Some(n as u8));
            }
        }
    }
    (comment.to_string(), None)
}

/// Merge the user comment and energy back into a single comment on write.
fn merge_energy(comment: &str, energy: Option<u8>) -> String {
    let base = comment.trim();
    match energy {
        Some(e) if (1..=5).contains(&e) => {
            if base.is_empty() {
                format!("Energy: {e}")
            } else {
                format!("{base} | Energy: {e}")
            }
        }
        _ => base.to_string(),
    }
}

/// Read tags + duration + artwork-presence in a single probe (big perf win for
/// large libraries vs. opening the file three times).
pub fn read_meta(path: &str) -> Result<(TrackTags, Option<u32>, bool), String> {
    let tagged = Probe::open(path)
        .map_err(|e| format!("open: {e}"))?
        .read()
        .map_err(|e| format!("read: {e}"))?;

    let duration = {
        let secs = tagged.properties().duration().as_secs();
        if secs == 0 {
            None
        } else {
            Some(secs as u32)
        }
    };

    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let Some(tag) = tag else {
        return Ok((TrackTags::default(), duration, false));
    };

    let has_artwork = tag.picture_count() > 0;
    let bpm = tag
        .get_string(&ItemKey::Bpm)
        .and_then(|s| s.trim().parse::<f32>().ok())
        .map(|f| f.round() as u32);
    let raw_comment = tag.comment().map(|c| c.to_string()).unwrap_or_default();
    let (comment, energy) = split_energy(&raw_comment);

    let tags = TrackTags {
        title: tag.title().map(|c| c.to_string()).unwrap_or_default(),
        artist: tag.artist().map(|c| c.to_string()).unwrap_or_default(),
        album: tag.album().map(|c| c.to_string()).unwrap_or_default(),
        genre: tag.genre().map(|c| c.to_string()).unwrap_or_default(),
        bpm,
        key: tag.get_string(&ItemKey::InitialKey).unwrap_or_default().to_string(),
        year: tag.year().map(|y| y as i32),
        energy,
        comment,
    };
    Ok((tags, duration, has_artwork))
}

/// Read the primary tag of a file into our `TrackTags` model.
pub fn read_tags(path: &str) -> Result<TrackTags, String> {
    read_meta(path).map(|(tags, _, _)| tags)
}

/// First embedded picture as a `data:` URL (None if no artwork / unreadable).
pub fn read_artwork(path: &str) -> Option<String> {
    let tagged = Probe::open(path).ok()?.read().ok()?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
    let pic = tag.pictures().first()?;
    let mime = pic.mime_type().map(|m| m.as_str()).unwrap_or("image/jpeg");
    Some(format!("data:{};base64,{}", mime, STANDARD.encode(pic.data())))
}

fn set_or_remove(tag: &mut Tag, key: ItemKey, value: &str) {
    if value.trim().is_empty() {
        tag.remove_key(&key);
    } else {
        tag.insert_text(key, value.to_string());
    }
}

/// Write approved tags back to a file, preserving the existing tag format.
pub fn write_tags(path: &str, tags: &TrackTags) -> Result<(), String> {
    let tagged = Probe::open(path)
        .map_err(|e| format!("open: {e}"))?
        .read()
        .map_err(|e| format!("read: {e}"))?;

    let tag_type = tagged
        .primary_tag()
        .map(|t| t.tag_type())
        .unwrap_or_else(|| tagged.primary_tag_type());
    let mut tag = tagged.primary_tag().cloned().unwrap_or_else(|| Tag::new(tag_type));

    set_or_remove(&mut tag, ItemKey::TrackTitle, &tags.title);
    set_or_remove(&mut tag, ItemKey::TrackArtist, &tags.artist);
    set_or_remove(&mut tag, ItemKey::AlbumTitle, &tags.album);
    set_or_remove(&mut tag, ItemKey::Genre, &tags.genre);
    // Energy is folded into the comment (project decision).
    set_or_remove(&mut tag, ItemKey::Comment, &merge_energy(&tags.comment, tags.energy));
    set_or_remove(&mut tag, ItemKey::InitialKey, &tags.key);

    match tags.bpm {
        Some(bpm) => {
            tag.insert_text(ItemKey::Bpm, bpm.to_string());
        }
        None => {
            tag.remove_key(&ItemKey::Bpm);
        }
    }
    match tags.year {
        Some(year) if year > 0 => tag.set_year(year as u32),
        _ => tag.remove_year(),
    }

    tag.save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("save: {e}"))
}
