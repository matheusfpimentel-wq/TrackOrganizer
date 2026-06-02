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

/// On-disk config, kept in the OS app-config dir. The API key never leaves the
/// backend: only `PublicConfig` (with `has_api_key`) is exposed to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredConfig {
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_char_limit")]
    pub char_limit: u32,
}

impl Default for StoredConfig {
    fn default() -> Self {
        Self { api_key: String::new(), model: default_model(), char_limit: default_char_limit() }
    }
}

impl StoredConfig {
    pub fn to_public(&self) -> PublicConfig {
        PublicConfig {
            model: self.model.clone(),
            char_limit: self.char_limit,
            has_api_key: !self.api_key.trim().is_empty(),
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
pub fn update_config(
    app: AppHandle,
    model: Option<String>,
    char_limit: Option<u32>,
    api_key: Option<String>,
) -> Result<PublicConfig, String> {
    let mut cfg = load(&app);
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
