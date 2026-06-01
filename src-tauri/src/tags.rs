use crate::model::TrackTags;
use lofty::config::WriteOptions;
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::Tag;

/// Read the primary tag of a file into our `TrackTags` model.
///
/// Returns an `Err(String)` for unreadable/corrupt files so the frontend can
/// surface the problem instead of the whole scan failing.
pub fn read_tags(path: &str) -> Result<TrackTags, String> {
    let tagged = Probe::open(path)
        .map_err(|e| format!("open: {e}"))?
        .read()
        .map_err(|e| format!("read: {e}"))?;

    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());

    let Some(tag) = tag else {
        // No tags present is not an error — return an empty set.
        return Ok(TrackTags::default());
    };

    let bpm = tag
        .get_string(&ItemKey::Bpm)
        .and_then(|s| s.trim().parse::<f32>().ok())
        .map(|f| f.round() as u32);

    Ok(TrackTags {
        title: tag.title().map(|c| c.to_string()).unwrap_or_default(),
        artist: tag.artist().map(|c| c.to_string()).unwrap_or_default(),
        album: tag.album().map(|c| c.to_string()).unwrap_or_default(),
        genre: tag.genre().map(|c| c.to_string()).unwrap_or_default(),
        bpm,
        key: tag.get_string(&ItemKey::InitialKey).unwrap_or_default().to_string(),
        year: tag.year().map(|y| y as i32),
        // Energy is deduced by the AI step; not parsed from disk yet.
        energy: None,
        comment: tag.comment().map(|c| c.to_string()).unwrap_or_default(),
    })
}

/// Whether the file carries at least one embedded picture (artwork).
pub fn has_artwork(path: &str) -> bool {
    match Probe::open(path).and_then(|p| p.read()) {
        Ok(tagged) => tagged
            .primary_tag()
            .or_else(|| tagged.first_tag())
            .map(|t| t.picture_count() > 0)
            .unwrap_or(false),
        Err(_) => false,
    }
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
    set_or_remove(&mut tag, ItemKey::Comment, &tags.comment);
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
