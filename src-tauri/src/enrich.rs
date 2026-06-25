use crate::config;
use crate::model::{EnrichInput, Enrichment};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rusty_chromaprint::{Configuration, FingerprintCompressor, Fingerprinter};
use serde_json::Value;
use tauri::AppHandle;

const USER_AGENT: &str = "Tracklistr/0.1 (https://github.com/matheusfpimentel-wq/TrackOrganizer)";

/// Compute an AcoustID-compatible Chromaprint fingerprint (compressed, base64
/// url-safe) for the audio file, plus its duration in seconds.
fn chromaprint_fp(path: &str, known_secs: Option<u32>) -> Option<(String, u32)> {
    let (mono, sample_rate, _ch) = crate::deepscan::decode_mono(path).ok()?;
    if sample_rate == 0 || mono.is_empty() {
        return None;
    }
    let decoded_secs = (mono.len() as u32) / sample_rate;
    let duration = known_secs.filter(|s| *s > 0).unwrap_or(decoded_secs);
    let samples: Vec<i16> = mono.iter().map(|&v| (v.clamp(-1.0, 1.0) * 32767.0) as i16).collect();

    let config = Configuration::preset_test2();
    let mut printer = Fingerprinter::new(&config);
    printer.start(sample_rate, 1).ok()?;
    printer.consume(&samples);
    printer.finish();
    let raw = printer.fingerprint();
    if raw.is_empty() {
        return None;
    }
    let compressed = FingerprintCompressor::from(&config).compress(raw);
    Some((URL_SAFE_NO_PAD.encode(&compressed), duration))
}

/// Identify a track by its audio via AcoustID; returns the first recording match.
async fn acoustid_lookup(
    client: &reqwest::Client,
    key: &str,
    path: &str,
    known_secs: Option<u32>,
) -> Option<Value> {
    let (fp, duration) = chromaprint_fp(path, known_secs)?;
    let dur = duration.to_string();
    let resp = client
        .get("https://api.acoustid.org/v2/lookup")
        .query(&[
            ("client", key),
            ("format", "json"),
            ("duration", dur.as_str()),
            ("fingerprint", fp.as_str()),
            ("meta", "recordings releasegroups"),
        ])
        .send()
        .await
        .ok()?;
    let value: Value = resp.json().await.ok()?;
    value
        .get("results")?
        .as_array()?
        .iter()
        .find_map(|r| {
            r.get("recordings")
                .and_then(Value::as_array)
                .and_then(|a| a.first())
                .cloned()
        })
}

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

/// First iTunes (Apple) song match (public API, no auth). Notably this is the
/// only free source that returns a per-track genre (`primaryGenreName`).
async fn itunes_first(client: &reqwest::Client, title: &str, artist: &str) -> Option<Value> {
    let term = format!("{artist} {title}");
    let resp = client
        .get("https://itunes.apple.com/search")
        .query(&[
            ("term", term.as_str()),
            ("entity", "song"),
            ("limit", "1"),
        ])
        .send()
        .await
        .ok()?;
    let value: Value = resp.json().await.ok()?;
    value.get("results")?.as_array()?.first().cloned()
}

/// Get a Spotify app token (client-credentials flow; no user login).
async fn spotify_token(client: &reqwest::Client, id: &str, secret: &str) -> Option<String> {
    let resp = client
        .post("https://accounts.spotify.com/api/token")
        .basic_auth(id, Some(secret))
        .form(&[("grant_type", "client_credentials")])
        .send()
        .await
        .ok()?;
    let value: Value = resp.json().await.ok()?;
    value.get("access_token").and_then(Value::as_str).map(String::from)
}

/// Look up a track on Spotify. Returns (album, year, genre). Spotify no longer
/// exposes BPM/key for new apps, and genre is taken from the primary artist.
async fn spotify_lookup(
    client: &reqwest::Client,
    token: &str,
    title: &str,
    artist: &str,
) -> Option<(Option<String>, Option<i32>, Option<String>)> {
    let q = format!("track:{title} artist:{artist}");
    let resp = client
        .get("https://api.spotify.com/v1/search")
        .bearer_auth(token)
        .query(&[("q", q.as_str()), ("type", "track"), ("limit", "1")])
        .send()
        .await
        .ok()?;
    let value: Value = resp.json().await.ok()?;
    let track = value.get("tracks")?.get("items")?.as_array()?.first()?;

    let album = track
        .get("album")
        .and_then(|a| a.get("name"))
        .and_then(Value::as_str)
        .map(String::from);
    let year = track
        .get("album")
        .and_then(|a| a.get("release_date"))
        .and_then(Value::as_str)
        .and_then(|d| d.chars().take(4).collect::<String>().parse::<i32>().ok());

    // Genre lives on the artist, not the track — one extra call.
    let mut genre = None;
    if let Some(aid) = track
        .get("artists")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .and_then(|x| x.get("id"))
        .and_then(Value::as_str)
    {
        if let Ok(ar) = client
            .get(format!("https://api.spotify.com/v1/artists/{aid}"))
            .bearer_auth(token)
            .send()
            .await
        {
            if let Ok(av) = ar.json::<Value>().await {
                genre = av
                    .get("genres")
                    .and_then(Value::as_array)
                    .and_then(|g| g.first())
                    .and_then(Value::as_str)
                    .map(String::from);
            }
        }
    }
    Some((album, year, genre))
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

    // One Spotify token for the whole batch (when enabled + configured).
    let spotify_token_opt = if cfg.enrich_spotify
        && !cfg.spotify_client_id.trim().is_empty()
        && !cfg.spotify_client_secret.trim().is_empty()
    {
        spotify_token(&client, &cfg.spotify_client_id, &cfg.spotify_client_secret).await
    } else {
        None
    };

    for t in tracks {
        let mut e = Enrichment {
            id: t.id.clone(),
            ..Default::default()
        };

        // AcoustID first: identifies by the actual audio (independent of the
        // possibly-wrong filename/tags), so it seeds the canonical title/artist.
        if cfg.enrich_acoustid && !cfg.acoustid_key.trim().is_empty() && !t.file_path.trim().is_empty()
        {
            if let Some(rec) = acoustid_lookup(&client, &cfg.acoustid_key, &t.file_path, t.duration_secs).await
            {
                e.title = rec.get("title").and_then(Value::as_str).map(String::from);
                e.artist = rec
                    .get("artists")
                    .and_then(Value::as_array)
                    .and_then(|a| a.first())
                    .and_then(|x| x.get("name"))
                    .and_then(Value::as_str)
                    .map(String::from);
                e.album = rec
                    .get("releasegroups")
                    .and_then(Value::as_array)
                    .and_then(|a| a.first())
                    .and_then(|x| x.get("title"))
                    .and_then(Value::as_str)
                    .map(String::from);
                e.sources.push("AcoustID".into());
            }
        }

        // Text-based providers need at least a title/artist to search.
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

        if cfg.enrich_itunes {
            if let Some(it) = itunes_first(&client, &t.title, &t.artist).await {
                if e.title.is_none() {
                    e.title = it.get("trackName").and_then(Value::as_str).map(String::from);
                }
                if e.artist.is_none() {
                    e.artist = it.get("artistName").and_then(Value::as_str).map(String::from);
                }
                if e.album.is_none() {
                    e.album = it.get("collectionName").and_then(Value::as_str).map(String::from);
                }
                if e.genre.is_none() {
                    e.genre = it
                        .get("primaryGenreName")
                        .and_then(Value::as_str)
                        .map(String::from);
                }
                if e.year.is_none() {
                    e.year = it
                        .get("releaseDate")
                        .and_then(Value::as_str)
                        .and_then(|d| d.chars().take(4).collect::<String>().parse::<i32>().ok());
                }
                e.sources.push("iTunes".into());
            }
        }

        if let Some(token) = &spotify_token_opt {
            if let Some((album, year, genre)) = spotify_lookup(&client, token, &t.title, &t.artist).await {
                if e.album.is_none() {
                    e.album = album;
                }
                if e.year.is_none() {
                    e.year = year;
                }
                if e.genre.is_none() {
                    e.genre = genre;
                }
                e.sources.push("Spotify".into());
            }
        }

        // AcoustID (audio-fingerprint identification) lands in a later step;
        // it needs a Chromaprint fingerprint, not the in-app dedup fingerprint.

        out.push(e);
    }

    Ok(out)
}
