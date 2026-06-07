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
    /// Track length in seconds (read-only, from audio properties).
    pub duration_secs: Option<u32>,
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

/// Context for a single track sent to the AI (current values + filename).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTrackInput {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub genre: String,
    pub comment: String,
    pub bpm: Option<u32>,
    pub key: String,
    pub year: Option<i32>,
    pub file_name: String,
}

/// One AI tagging request (already chunked to ~20 tracks by the frontend).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    pub tracks: Vec<AiTrackInput>,
    /// Subset of ["title", "artist", "genre", "energy"] to suggest.
    pub fields: Vec<String>,
    pub char_limit: u32,
}

/// AI proposal for a single track. Only requested fields are populated.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSuggestion {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    /// Energy 1..5 (written into the comment on save).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub energy: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub suggestions: Vec<AiSuggestion>,
}

/// Public view of the local config (never exposes the API key to the frontend).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    /// "claude" or "ollama".
    pub provider: String,
    pub model: String,
    pub char_limit: u32,
    pub has_api_key: bool,
    pub ollama_url: String,
    pub ollama_model: String,
    pub genres: Vec<String>,
    pub genre_strict: bool,
}
