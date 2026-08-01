use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::agent_connection::AgentConnectionConfig;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub vault_path: Option<String>,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub language: Language,
    #[serde(default = "default_outline_sound")]
    pub outline_sound: bool,
    #[serde(default)]
    pub agent_connections: Vec<AgentConnectionConfig>,
    #[serde(default)]
    pub active_agent_connection: Option<String>,
    #[serde(default, skip_serializing)]
    pub agent_connection: Option<AgentConnectionConfig>,
}

const fn default_outline_sound() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            vault_path: None,
            theme: Theme::default(),
            language: Language::default(),
            outline_sound: default_outline_sound(),
            agent_connections: Vec::new(),
            active_agent_connection: None,
            agent_connection: None,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub enum Language {
    #[default]
    #[serde(rename = "en")]
    English,
    #[serde(rename = "zh-CN")]
    SimplifiedChinese,
}

fn config_file(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("config.json"))
}

pub fn load(app: &tauri::AppHandle) -> AppConfig {
    let Ok(path) = config_file(app) else {
        return AppConfig::default();
    };
    let mut config: AppConfig = fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    if config.agent_connections.is_empty() {
        if let Some(connection) = config.agent_connection.take() {
            config.active_agent_connection = Some(connection.slug.clone());
            config.agent_connections.push(connection);
        }
    }
    if config.active_agent_connection.as_ref().is_none_or(|slug| {
        !config
            .agent_connections
            .iter()
            .any(|item| &item.slug == slug)
    }) {
        config.active_agent_connection = config
            .agent_connections
            .first()
            .map(|item| item.slug.clone());
    }
    config
}

pub fn save(app: &tauri::AppHandle, config: &AppConfig) -> AppResult<()> {
    let path = config_file(app)?;
    fs::write(path, serde_json::to_string_pretty(config)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{AppConfig, Language};

    #[test]
    fn old_config_defaults_to_english() {
        let config: AppConfig = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(config.language, Language::English);
        assert!(config.outline_sound);
    }

    #[test]
    fn language_roundtrips_with_bcp47_code() {
        let config: AppConfig = serde_json::from_str(r#"{"language":"zh-CN"}"#).unwrap();
        assert_eq!(config.language, Language::SimplifiedChinese);
        assert!(serde_json::to_string(&config).unwrap().contains("zh-CN"));
    }

    #[test]
    fn outline_sound_preference_roundtrips() {
        let config: AppConfig = serde_json::from_str(r#"{"outlineSound":false}"#).unwrap();
        assert!(!config.outline_sound);
        assert!(serde_json::to_string(&config)
            .unwrap()
            .contains(r#""outlineSound":false"#));
    }
}
