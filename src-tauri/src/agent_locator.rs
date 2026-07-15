use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{AppError, AppResult};

pub struct LocatedPi {
    pub path: PathBuf,
    pub env_path: String,
}

struct ShellProbe {
    pi: Option<PathBuf>,
    env_path: String,
}

pub async fn locate_in_background() -> AppResult<Option<LocatedPi>> {
    tauri::async_runtime::spawn_blocking(locate)
        .await
        .map_err(|error| AppError::Other(format!("failed to locate Pi: {error}")))
}

fn locate() -> Option<LocatedPi> {
    let inherited_path = env::var("PATH").unwrap_or_default();
    let shell = login_shell_probe();
    let home = env::var_os("HOME").map(PathBuf::from)?;
    locate_with_paths(&inherited_path, shell, &home)
}

fn locate_with_paths(
    inherited_path: &str,
    shell: Option<ShellProbe>,
    home: &Path,
) -> Option<LocatedPi> {
    let shell_path = shell
        .as_ref()
        .map(|probe| probe.env_path.as_str())
        .unwrap_or_default();
    let path = shell
        .as_ref()
        .and_then(|probe| probe.pi.clone())
        .filter(|path| is_executable(path))
        .or_else(|| find_in_path("pi", shell_path))
        .or_else(|| find_in_path("pi", inherited_path))
        .or_else(|| find_known_pi(home))?;
    let env_path = merged_path(&path, shell_path, inherited_path, home);
    Some(LocatedPi { path, env_path })
}

fn find_known_pi(home: &Path) -> Option<PathBuf> {
    for relative in [".npm-global/bin/pi", ".local/bin/pi", ".bun/bin/pi"] {
        let path = home.join(relative);
        if is_executable(&path) {
            return Some(path);
        }
    }
    None
}

fn login_shell_probe() -> Option<ShellProbe> {
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
    let pi = stdout
        .lines()
        .find_map(|line| line.strip_prefix("__ORNATA_PI__"))
        .filter(|path| !path.is_empty())
        .map(PathBuf::from);
    let env_path = stdout
        .lines()
        .find_map(|line| line.strip_prefix("__ORNATA_PATH__"))?
        .to_string();
    Some(ShellProbe { pi, env_path })
}

fn merged_path(pi: &Path, shell_path: &str, inherited_path: &str, home: &Path) -> String {
    let mut directories = Vec::new();
    if let Some(parent) = pi.parent() {
        push_unique(&mut directories, parent.to_path_buf());
    }
    for path in [shell_path, inherited_path] {
        for directory in env::split_paths(path) {
            push_unique(&mut directories, directory);
        }
    }
    for directory in [
        home.join(".npm-global/bin"),
        home.join(".local/bin"),
        home.join(".bun/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ] {
        push_unique(&mut directories, directory);
    }
    env::join_paths(directories)
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| inherited_path.to_string())
}

fn push_unique(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !path.as_os_str().is_empty() && !paths.contains(&path) {
        paths.push(path);
    }
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

    #[test]
    fn known_pi_keeps_node_from_login_shell_path() {
        use std::os::unix::fs::PermissionsExt;

        let home = tempdir().unwrap();
        let pi_dir = home.path().join(".npm-global/bin");
        let node_dir = home.path().join("homebrew/bin");
        std::fs::create_dir_all(&pi_dir).unwrap();
        std::fs::create_dir_all(&node_dir).unwrap();
        let pi = pi_dir.join("pi");
        let node = node_dir.join("node");
        std::fs::write(&pi, "#!/usr/bin/env node\n").unwrap();
        std::fs::write(&node, "#!/bin/sh\n").unwrap();
        for executable in [&pi, &node] {
            let mut permissions = executable.metadata().unwrap().permissions();
            permissions.set_mode(0o755);
            std::fs::set_permissions(executable, permissions).unwrap();
        }

        let shell_path = env::join_paths([node_dir]).unwrap();
        let located = locate_with_paths(
            "/usr/bin:/bin:/usr/sbin:/sbin",
            Some(ShellProbe {
                pi: None,
                env_path: shell_path.to_string_lossy().into_owned(),
            }),
            home.path(),
        )
        .unwrap();

        assert_eq!(located.path, pi);
        assert_eq!(find_in_path("pi", &located.env_path), Some(pi));
        assert_eq!(find_in_path("node", &located.env_path), Some(node));
    }
}
