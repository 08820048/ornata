use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{AppError, AppResult};

pub struct LocatedPi {
    pub path: PathBuf,
    pub env_path: String,
}

pub async fn locate_in_background() -> AppResult<Option<LocatedPi>> {
    tauri::async_runtime::spawn_blocking(locate)
        .await
        .map_err(|error| AppError::Other(format!("failed to locate Pi: {error}")))
}

fn locate() -> Option<LocatedPi> {
    if let Some((path, env_path)) = login_shell_pi() {
        return Some(LocatedPi { path, env_path });
    }

    let env_path = env::var("PATH").unwrap_or_default();
    if let Some(path) = find_in_path("pi", &env_path) {
        return Some(LocatedPi { path, env_path });
    }

    let home = env::var_os("HOME").map(PathBuf::from)?;
    for relative in [".npm-global/bin/pi", ".local/bin/pi", ".bun/bin/pi"] {
        let path = home.join(relative);
        if is_executable(&path) {
            return Some(LocatedPi { path, env_path });
        }
    }
    None
}

fn login_shell_pi() -> Option<(PathBuf, String)> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let output = Command::new(shell)
        .args([
            "-lc",
            "printf '__ORNATA_PI__%s\\n__ORNATA_PATH__%s\\n' \"$(command -v pi)\" \"$PATH\"",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let path = stdout
        .lines()
        .find_map(|line| line.strip_prefix("__ORNATA_PI__"))?;
    let env_path = stdout
        .lines()
        .find_map(|line| line.strip_prefix("__ORNATA_PATH__"))?
        .to_string();
    let path = PathBuf::from(path);
    is_executable(&path).then_some((path, env_path))
}

fn find_in_path(name: &str, path: &str) -> Option<PathBuf> {
    env::split_paths(path)
        .map(|dir| dir.join(name))
        .find(|candidate| is_executable(candidate))
}

fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn finds_executable_in_path() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempdir().unwrap();
        let binary = dir.path().join("pi");
        std::fs::write(&binary, "#!/bin/sh\n").unwrap();
        let mut permissions = binary.metadata().unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&binary, permissions).unwrap();

        assert_eq!(
            find_in_path("pi", dir.path().to_str().unwrap()),
            Some(binary)
        );
    }
}
