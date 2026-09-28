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
    #[serde(default = "default_cursor_animation")]
    pub cursor_animation: bool,
    #[serde(default)]
    pub image_upload: ImageUpload,
    #[serde(default)]
    pub pdf: PdfSettings,
    #[serde(default)]
    pub agent_connections: Vec<AgentConnectionConfig>,
    #[serde(default)]
    pub active_agent_connection: Option<String>,
    #[serde(default, skip_serializing)]
    pub agent_connection: Option<AgentConnectionConfig>,
}

/// Where pasted images go. `Local` keeps them in the vault's asset folder;
/// `Custom` runs the user's upload command (e.g. PicGo) and embeds the
/// returned URL, falling back to local storage when the command fails.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageUpload {
    #[serde(default)]
    pub mode: ImageUploadMode,
    #[serde(default)]
    pub command: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageUploadMode {
    #[default]
    Local,
    Custom,
}

/// Page setup for PDF export. Presets rather than free-form numbers: a few
/// well-chosen options cover real use and can't produce a broken page.
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSettings {
    #[serde(default)]
    pub paper: PaperSize,
    #[serde(default)]
    pub margins: PageMargins,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PaperSize {
    /// Whatever the system print setup uses (A4 or Letter by region).
    #[default]
    System,
    A4,
    Letter,
    A5,
}

impl PaperSize {
    /// Width × height in PDF points (1/72 in); None follows the system.
    pub fn points(self) -> Option<(f64, f64)> {
        match self {
            Self::System => None,
            Self::A4 => Some((mm_to_points(210.0), mm_to_points(297.0))),
            Self::Letter => Some((612.0, 792.0)),
            Self::A5 => Some((mm_to_points(148.0), mm_to_points(210.0))),
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PageMargins {
    Narrow,
    #[default]
    Normal,
    Wide,
}

impl PageMargins {
    /// The same margin on all four sides, in PDF points. Normal ≈ 40pt,
    /// in line with Typora; WebKit prints 1 CSS px ≈ 1pt.
    pub fn points(self) -> f64 {
        mm_to_points(match self {
            Self::Narrow => 10.0,
            Self::Normal => 14.0,
            Self::Wide => 20.0,
        })
    }
}

fn mm_to_points(mm: f64) -> f64 {
    mm / 25.4 * 72.0
}

const fn default_outline_sound() -> bool {
    true
}

const fn default_cursor_animation() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            vault_path: None,
            theme: Theme::default(),
            language: Language::default(),
            outline_sound: default_outline_sound(),
            cursor_animation: default_cursor_animation(),
            image_upload: ImageUpload::default(),
            pdf: PdfSettings::default(),
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
        assert!(config.cursor_animation);
        assert!(serde_json::to_string(&config).unwrap().contains("cursorAnimation"));
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

    #[test]
    fn image_upload_defaults_to_local() {
        let config: AppConfig = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(config.image_upload.mode, super::ImageUploadMode::Local);
        assert!(config.image_upload.command.is_empty());
    }

    #[test]
    fn image_upload_roundtrips() {
        let config: AppConfig = serde_json::from_str(
            r#"{"imageUpload":{"mode":"custom","command":"picgo upload"}}"#,
        )
        .unwrap();
        assert_eq!(config.image_upload.mode, super::ImageUploadMode::Custom);
        assert_eq!(config.image_upload.command, "picgo upload");
    }

    #[test]
    fn pdf_settings_default_to_system_paper_and_normal_margins() {
        let config: AppConfig = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(config.pdf.paper, super::PaperSize::System);
        assert_eq!(config.pdf.margins, super::PageMargins::Normal);
        assert_eq!(config.pdf.paper.points(), None);
    }

    #[test]
    fn pdf_settings_roundtrip_and_measure() {
        let config: AppConfig =
            serde_json::from_str(r#"{"pdf":{"paper":"a4","margins":"wide"}}"#).unwrap();
        assert_eq!(config.pdf.paper, super::PaperSize::A4);
        let (w, h) = config.pdf.paper.points().unwrap();
        assert!((w - 595.28).abs() < 0.01 && (h - 841.89).abs() < 0.01);
        assert!((config.pdf.margins.points() - 56.69).abs() < 0.01);
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains(r#""pdf":{"paper":"a4","margins":"wide"}"#));
    }
}
