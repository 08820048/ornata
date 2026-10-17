use std::path::{Path, PathBuf};

use crate::config::{AppConfig, CliAccess};
use crate::error::{AppError, AppResult};

use super::tools::Level;

/// Where the app keeps `config.json` (Tauri's app config dir for the bundle
/// identifier `app.ornata`).
pub fn config_dir() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME")?);
    let dir = if cfg!(target_os = "macos") {
        home.join("Library/Application Support/app.ornata")
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"))
            .join("app.ornata")
    };
    Some(dir)
}

fn config_path() -> Option<PathBuf> {
    config_dir().map(|dir| dir.join("config.json"))
}

fn load_config(path: &Path) -> AppConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// The vault to operate on and what the app's Settings allow there.
pub struct Target {
    pub root: PathBuf,
    pub level: Level,
}

/// `--vault`, else `ORNATA_VAULT`, else the vault the app last opened.
pub fn resolve(flag: Option<&str>, ceiling: Option<Level>) -> AppResult<Target> {
    resolve_in(flag, ceiling, config_path().as_deref())
}

fn resolve_in(flag: Option<&str>, ceiling: Option<Level>, config: Option<&Path>) -> AppResult<Target> {
    let config = config.map(load_config).unwrap_or_default();
    resolve_with(flag, ceiling, &config)
}

/// The vault the app has open and what Settings allow there; `None` before
/// any vault is chosen. Used by the in-app server, which re-reads settings on
/// every request so a change in the panel applies immediately.
pub fn target_from(config: &AppConfig) -> Option<Target> {
    // The app's own vault, never ORNATA_VAULT from whatever launched it.
    resolve_with(config.vault_path.as_deref(), None, config).ok()
}

fn resolve_with(flag: Option<&str>, ceiling: Option<Level>, config: &AppConfig) -> AppResult<Target> {
    let chosen = flag
        .map(str::to_string)
        .or_else(|| std::env::var("ORNATA_VAULT").ok().filter(|v| !v.is_empty()))
        .or_else(|| config.vault_path.clone())
        .ok_or_else(|| {
            AppError::NotFound(
                "no vault: open one in Ornata, pass --vault <folder>, or set ORNATA_VAULT".into(),
            )
        })?;
    let root = PathBuf::from(&chosen);
    if !root.is_dir() {
        return Err(AppError::NotFound(format!("vault folder not found: {chosen}")));
    }
    let access = config
        .cli_access
        .get(&chosen)
        .copied()
        .unwrap_or(CliAccess::default());
    // Launch arguments may only lower what Settings allow.
    let level = Level::from(access).min(ceiling.unwrap_or(Level::Destructive));
    Ok(Target { root, level })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn config_with(dir: &Path, vault: &Path, access: Option<&str>) -> PathBuf {
        let path = dir.join("config.json");
        let key = vault.to_string_lossy();
        let access = access
            .map(|a| format!(r#","cliAccess":{{"{key}":"{a}"}}"#))
            .unwrap_or_default();
        std::fs::write(&path, format!(r#"{{"vaultPath":"{key}"{access}}}"#)).unwrap();
        path
    }

    #[test]
    fn defaults_to_the_apps_vault_and_read_only() {
        let dir = tempdir().unwrap();
        let vault = tempdir().unwrap();
        let config = config_with(dir.path(), vault.path(), None);
        let target = resolve_in(None, None, Some(&config)).unwrap();
        assert_eq!(target.root, vault.path());
        assert_eq!(target.level, Level::ReadOnly);
    }

    #[test]
    fn settings_choose_the_level_and_flags_only_lower_it() {
        let dir = tempdir().unwrap();
        let vault = tempdir().unwrap();
        let config = config_with(dir.path(), vault.path(), Some("full"));
        assert_eq!(resolve_in(None, None, Some(&config)).unwrap().level, Level::Destructive);
        assert_eq!(resolve_in(None, Some(Level::ReadOnly), Some(&config)).unwrap().level, Level::ReadOnly);

        let read_only = config_with(dir.path(), vault.path(), Some("readOnly"));
        // a flag can never raise it
        assert_eq!(resolve_in(None, Some(Level::Destructive), Some(&read_only)).unwrap().level, Level::ReadOnly);
        let off = config_with(dir.path(), vault.path(), Some("off"));
        assert_eq!(resolve_in(None, None, Some(&off)).unwrap().level, Level::Off);
    }

    #[test]
    fn a_missing_vault_is_an_error() {
        let dir = tempdir().unwrap();
        let missing = dir.path().join("nope");
        assert!(resolve_in(Some(missing.to_str().unwrap()), None, None).is_err());
        assert!(resolve_in(None, None, None).is_err() || std::env::var("ORNATA_VAULT").is_ok());
    }
}
