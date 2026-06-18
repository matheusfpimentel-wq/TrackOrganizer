use crate::config;
use crate::model::{EnrichInput, Enrichment};
use serde_json::Value;
use tauri::AppHandle;

const USER_AGENT: &str = "Tracklistr/0.1 (https://github.com/matheusfpimentel-wq/TrackOrganizer)";

/// First Deezer search hit for "artist title" (public API, no auth).
async fn deezer_first(client: &reqwest::Client, title: &str, artist: &str) -> Option<Value> {
    let q = format!("{artist} {title}");
    let resp = client
        .get("https://api.deezer.com/search")
        .query(&[("q", q.as_str()), ("limit", "1")])
        .send()
        .await
        .ok()?;
    let value: Value = resp.json().await.ok()?;
    value.get("data")?.as_array()?.first().cloned()
}

/// First MusicBrainz recording match. MB requires a descriptive User-Agent.
async fn mb_first(client: &reqwest::Client, title: &str, artist: &str) -> Option<Value> {
    let query = format!(
        "recording:\"{}\" AND artist:\"{}\"",
        title.replace('"', " "),
        artist.replace('"', " ")
    );
    let resp = client
        .get("https://musicbrainz.org/ws/2/recording")
        .query(&[("query", query.as_str()), ("fmt", "json"), ("limit", "1")])
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .ok()?;
    let value: Value = resp.json().await.ok()?;
    value.get("recordings")?.as_array()?.first().cloned()
}

/// Look up reference metadata for each track on the enabled platforms.
///
/// Phase 1 implements Deezer (BPM + canonical title/artist/album) and
/// MusicBrainz (album/year/canonical). Spotify and AcoustID are gated behind
/// keys and handled in a later phase.
#[tauri::command]
pub async fn enrich_tracks(app: AppHandle, tracks: Vec<EnrichInput>) -> Result<Vec<Enrichment>, String> {
    let cfg = config::load(&app);
    let client = reqwest::Client::new();
    let mut out = Vec::with_capacity(tracks.len());

    for t in tracks {
        let mut e = Enrichment {
            id: t.id.clone(),
            ..Default::default()
        };
        if t.title.trim().is_empty() && t.artist.trim().is_empty() {
            out.push(e);
            continue;
        }

        if cfg.enrich_deezer {
            if let Some(d) = deezer_first(&client, &t.title, &t.artist).await {
                e.title = d.get("title").and_then(Value::as_str).map(String::from);
                e.artist = d
                    .get("artist")
                    .and_then(|x| x.get("name"))
                    .and_then(Value::as_str)
                    .map(String::from);
                e.album = d
                    .get("album")
                    .and_then(|x| x.get("title"))
                    .and_then(Value::as_str)
                    .map(String::from);
                let bpm = d
                    .get("bpm")
                    .and_then(Value::as_f64)
                    .filter(|b| *b >= 1.0)
                    .map(|b| b.round() as u32);
                if bpm.is_some() {
                    e.bpm = bpm;
                }
                e.sources.push("Deezer".into());
            }
        }

        if cfg.enrich_musicbrainz {
            if let Some(m) = mb_first(&client, &t.title, &t.artist).await {
                if e.title.is_none() {
                    e.title = m.get("title").and_then(Value::as_str).map(String::from);
                }
                if e.artist.is_none() {
                    e.artist = m
                        .get("artist-credit")
                        .and_then(Value::as_array)
                        .and_then(|a| a.first())
                        .and_then(|x| x.get("name"))
                        .and_then(Value::as_str)
                        .map(String::from);
                }
                if let Some(rel) = m
                    .get("releases")
                    .and_then(Value::as_array)
                    .and_then(|a| a.first())
                {
                    if e.album.is_none() {
                        e.album = rel.get("title").and_then(Value::as_str).map(String::from);
                    }
                    if e.year.is_none() {
                        if let Some(date) = rel.get("date").and_then(Value::as_str) {
                            if let Ok(y) = date.chars().take(4).collect::<String>().parse::<i32>() {
                                e.year = Some(y);
                            }
                        }
                    }
                }
                e.sources.push("MusicBrainz".into());
            }
        }

        // Spotify (artist genres / popularity) and AcoustID (fingerprint id)
        // require keys and land in a later phase.

        out.push(e);
    }

    Ok(out)
}
