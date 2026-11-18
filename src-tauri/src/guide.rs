//! The getting-started notes written into a brand-new vault: a welcome page,
//! a playground, a folder of short guides and an example project, in the
//! app's language. They are ordinary notes the user edits or deletes; the app
//! never rewrites them after the first launch.
//!
//! Sources live in `src-tauri/guide/<lang>/`. Links between them are written
//! `[Title](note:Folder/Note name.md)` and turned into the same encoded href
//! the editor writes; shortcuts are written the Mac way and spelled out for
//! Windows here, as `keyLabel` does in the frontend.

use std::fs;
use std::path::Path;

use crate::config::Language;
use crate::error::AppResult;
use crate::link_rewrite::rel_to_href;
use crate::projects::MARKER;
use crate::vault::notes_root;

/// (path under `notes/`, source text).
type Files = &'static [(&'static str, &'static str)];

const EN: Files = &[
    ("Welcome.md", include_str!("../guide/en/welcome.md")),
    ("Playground.md", include_str!("../guide/en/playground.md")),
    ("Getting started/Writing and formatting.md", include_str!("../guide/en/writing.md")),
    ("Getting started/Links, backlinks and the graph.md", include_str!("../guide/en/links.md")),
    ("Getting started/Find your way around.md", include_str!("../guide/en/find.md")),
    ("Getting started/Projects and tasks.md", include_str!("../guide/en/projects.md")),
    ("Getting started/Working with AI agents.md", include_str!("../guide/en/agents.md")),
    ("Getting started/Make it yours.md", include_str!("../guide/en/yours.md")),
    ("Getting started/Example project/Tasks.md", include_str!("../guide/en/example-tasks.md")),
];
const EN_PROJECT: &str = "Getting started/Example project";

const ZH: Files = &[
    ("欢迎使用 Ornata.md", include_str!("../guide/zh/welcome.md")),
    ("练习场.md", include_str!("../guide/zh/playground.md")),
    ("上手指南/写作与格式.md", include_str!("../guide/zh/writing.md")),
    ("上手指南/链接、反链与图谱.md", include_str!("../guide/zh/links.md")),
    ("上手指南/查找与浏览.md", include_str!("../guide/zh/find.md")),
    ("上手指南/项目与任务.md", include_str!("../guide/zh/projects.md")),
    ("上手指南/与 AI agent 协作.md", include_str!("../guide/zh/agents.md")),
    ("上手指南/个性化.md", include_str!("../guide/zh/yours.md")),
    ("上手指南/示例项目/任务.md", include_str!("../guide/zh/example-tasks.md")),
];
const ZH_PROJECT: &str = "上手指南/示例项目";

fn files(language: Language) -> (Files, &'static str) {
    match language {
        Language::English => (EN, EN_PROJECT),
        Language::SimplifiedChinese => (ZH, ZH_PROJECT),
    }
}

/// Write the guide into `notes/`. A file that already exists is left alone.
pub fn seed(root: &Path, language: Language) -> AppResult<()> {
    let notes = notes_root(root);
    let (files, project) = files(language);
    for (rel, text) in files {
        let path = notes.join(rel);
        if path.exists() {
            continue;
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, render(text, cfg!(target_os = "macos")))?;
    }
    let marker = notes.join(project).join(MARKER);
    if !marker.exists() {
        fs::write(marker, "")?;
    }
    Ok(())
}

/// Source text → note text: `note:` links encoded, shortcuts and the file
/// manager named for the platform.
fn render(text: &str, mac: bool) -> String {
    let linked = encode_note_links(text);
    if mac {
        linked
    } else {
        windows_words(&linked)
    }
}

fn encode_note_links(text: &str) -> String {
    const OPEN: &str = "](note:";
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find(OPEN) {
        let after = &rest[start + OPEN.len()..];
        let Some(end) = after.find(')') else { break };
        out.push_str(&rest[..start]);
        out.push_str("](");
        out.push_str(&rel_to_href(&after[..end]));
        out.push(')');
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    out
}

/// `⌘⇧F` → `Ctrl+Shift+F`, a lone `⌘` → `Ctrl`, Finder → File Explorer.
fn windows_words(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 32);
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        let name = match c {
            '⌘' | '⌃' => "Ctrl",
            '⌥' => "Alt",
            '⇧' => "Shift",
            _ => {
                out.push(c);
                continue;
            }
        };
        out.push_str(name);
        if chars.peek().is_some_and(|next| !next.is_whitespace() && *next != '*') {
            out.push('+');
        }
    }
    out.replace("Finder", "File Explorer").replace("访达", "文件资源管理器")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backlinks::percent_decode;

    #[test]
    fn note_links_are_encoded_like_the_editor_writes_them() {
        assert_eq!(
            encode_note_links("See [Links](note:Getting started/Links, backlinks and the graph.md)."),
            "See [Links](Getting%20started/Links%2C%20backlinks%20and%20the%20graph.md)."
        );
        assert_eq!(
            encode_note_links("[练习场](note:练习场.md)"),
            format!("[练习场]({})", rel_to_href("练习场.md"))
        );
        assert_eq!(encode_note_links("no links (here)"), "no links (here)");
    }

    #[test]
    fn shortcuts_are_spelled_out_for_windows() {
        assert_eq!(windows_words("**⌘⇧F** and ⌥↑"), "**Ctrl+Shift+F** and Alt+↑");
        assert_eq!(windows_words("⌘click, 按住 ⌘ 点击"), "Ctrl+click, 按住 Ctrl 点击");
        assert_eq!(windows_words("open it in Finder"), "open it in File Explorer");
    }

    /// Every `note:` link in every guide must name a file the guide writes.
    #[test]
    fn every_link_points_at_a_guide_note() {
        for language in [Language::English, Language::SimplifiedChinese] {
            let (files, project) = files(language);
            assert!(files.iter().any(|(rel, _)| rel.starts_with(project)));
            for (rel, text) in files {
                for part in text.split("](note:").skip(1) {
                    let target = &part[..part.find(')').expect("closing paren")];
                    assert!(
                        files.iter().any(|(other, _)| *other == target),
                        "{rel} links to missing {target}"
                    );
                }
            }
        }
    }

    #[test]
    fn seeds_notes_and_the_example_project_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let notes = notes_root(dir.path());
        fs::create_dir_all(&notes).unwrap();
        fs::write(notes.join("Welcome.md"), "mine").unwrap();

        seed(dir.path(), Language::English).unwrap();

        assert_eq!(fs::read_to_string(notes.join("Welcome.md")).unwrap(), "mine");
        let writing = fs::read_to_string(notes.join("Getting started/Writing and formatting.md")).unwrap();
        assert!(!writing.contains("note:"));
        assert!(notes.join(EN_PROJECT).join(MARKER).is_file());
        // The encoded hrefs decode back to the files written.
        let welcome_src = EN[0].1;
        for part in encode_note_links(welcome_src).split("](").skip(1) {
            let href = &part[..part.find(')').unwrap()];
            assert!(notes.join(percent_decode(href)).is_file(), "{href}");
        }
    }
}
