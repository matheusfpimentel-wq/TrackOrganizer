use serde::{Deserialize, Serialize};

/// Editable tag set for a single track. Mirrors the TS `TrackTags`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTags {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: String,
    pub bpm: Option<u32>,
    /// Musical key (Tom).
    pub key: String,
    pub year: Option<i32>,
    /// Energy 1..5 (deduced by AI later).
    pub energy: Option<u8>,
    pub comment: String,
}

/// Raw record produced by a folder scan / single read.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedTrack {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub format: String,
    pub has_artwork: bool,
    pub tags: TrackTags,
    /// Set when the file could not be parsed.
    pub error: Option<String>,
}

/// One write-back request from the frontend (already user-approved).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteRequest {
    pub file_path: String,
    pub tags: TrackTags,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub file_path: String,
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteOutcome {
    pub backup_path: String,
    pub results: Vec<WriteResult>,
}
