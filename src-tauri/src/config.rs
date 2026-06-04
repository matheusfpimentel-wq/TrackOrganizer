use crate::model::PublicConfig;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn default_model() -> String {
    "claude-sonnet-4-6".to_string()
}

fn default_char_limit() -> u32 {
    50
}

fn default_provider() -> String {
    "claude".to_string()
}

fn default_ollama_url() -> String {
    "http://localhost:11434".to_string()
}

fn default_ollama_model() -> String {
    "llama3.1".to_string()
}

/// On-disk config, kept in the OS app-config dir. The API key never leaves the
/// backend: only `PublicConfig` (with `has_api_key`) is exposed to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredConfig {
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_char_limit")]
    pub char_limit: u32,
    #[serde(default = "default_ollama_url")]
    pub ollama_url: String,
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,
    /// User-curated genre vocabulary the AI should use.
    #[serde(default)]
    pub genres: Vec<String>,
    /// When true, the AI may only pick genres from `genres`.
    #[serde(default)]
    pub genre_strict: bool,
}

impl Default for StoredConfig {
    fn default() -> Self {
        Self {
            provider: default_provider(),
            api_key: String::new(),
            model: default_model(),
            char_limit: default_char_limit(),
            ollama_url: default_ollama_url(),
            ollama_model: default_ollama_model(),
            genres: Vec::new(),
            genre_strict: false,
        }
    }
}

impl StoredConfig {
    pub fn to_public(&self) -> PublicConfig {
        PublicConfig {
            provider: self.provider.clone(),
            model: self.model.clone(),
            char_limit: self.char_limit,
            has_api_key: !self.api_key.trim().is_empty(),
            ollama_url: self.ollama_url.clone(),
            ollama_model: self.ollama_model.clone(),
            genres: self.genres.clone(),
            genre_strict: self.genre_strict,
        }
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| format!("config dir: {e}"))?;
    Ok(dir.join("config.json"))
}

pub fn load(app: &AppHandle) -> StoredConfig {
    let Ok(path) = config_path(app) else {
        return StoredConfig::default();
    };
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => StoredConfig::default(),
    }
}

pub fn save(app: &AppHandle, cfg: &StoredConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create config dir: {e}"))?;
    }
    let text = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize config: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("write config: {e}"))
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> PublicConfig {
    load(&app).to_public()
}

/// Update any subset of the config. Passing an empty/absent `api_key` leaves the
/// stored key untouched (so the UI never needs to read it back to re-save).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_config(
    app: AppHandle,
    provider: Option<String>,
    model: Option<String>,
    char_limit: Option<u32>,
    api_key: Option<String>,
    ollama_url: Option<String>,
    ollama_model: Option<String>,
    genres: Option<Vec<String>>,
    genre_strict: Option<bool>,
) -> Result<PublicConfig, String> {
    let mut cfg = load(&app);
    if let Some(p) = provider {
        if p == "claude" || p == "ollama" {
            cfg.provider = p;
        }
    }
    if let Some(m) = model {
        if !m.trim().is_empty() {
            cfg.model = m;
        }
    }
    if let Some(limit) = char_limit {
        cfg.char_limit = limit.clamp(10, 200);
    }
    if let Some(key) = api_key {
        if !key.trim().is_empty() {
            cfg.api_key = key.trim().to_string();
        }
    }
    if let Some(url) = ollama_url {
        if !url.trim().is_empty() {
            cfg.ollama_url = url.trim().trim_end_matches('/').to_string();
        }
    }
    if let Some(om) = ollama_model {
        if !om.trim().is_empty() {
            cfg.ollama_model = om.trim().to_string();
        }
    }
    if let Some(list) = genres {
        // Normalize: trim, drop empties, de-duplicate case-insensitively.
        let mut seen = std::collections::HashSet::new();
        cfg.genres = list
            .into_iter()
            .map(|g| g.trim().to_string())
            .filter(|g| !g.is_empty() && seen.insert(g.to_lowercase()))
            .collect();
    }
    if let Some(strict) = genre_strict {
        cfg.genre_strict = strict;
    }
    save(&app, &cfg)?;
    Ok(cfg.to_public())
}

/// Remove the stored API key.
#[tauri::command]
pub fn clear_api_key(app: AppHandle) -> Result<PublicConfig, String> {
    let mut cfg = load(&app);
    cfg.api_key = String::new();
    save(&app, &cfg)?;
    Ok(cfg.to_public())
}
