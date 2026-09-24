use std::fs;
use std::path::Path;

use serde::Deserialize;

use crate::error::AppResult;
use crate::notes;
use crate::vault::DATA_DIR;

#[derive(Deserialize)]
struct LegacyTodo {
    text: String,
    #[serde(default)]
    done: bool,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Deserialize)]
struct LegacyBookmark {
    url: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    tags: Vec<String>,
}

/// Convert the retired `.ornata/todos.json` / `bookmarks.json` stores into
/// plain notes, then rename the JSON files to `*.archived` so this runs once.
/// Unreadable stores are left untouched.
pub fn archive_collections(root: &Path) -> AppResult<()> {
    archive::<LegacyTodo>(root, "todos", "Todos", |todo| {
        let mark = if todo.done { "x" } else { " " };
        format!("- [{mark}] {}{}", todo.text.trim(), tag_suffix(&todo.tags))
    })?;
    archive::<LegacyBookmark>(root, "bookmarks", "Bookmarks", |b| {
        let title = match b.title.trim() {
            "" => b.url.as_str(),
            title => title,
        };
        format!("- [{title}]({}){}", b.url, tag_suffix(&b.tags))
    })
}

fn archive<T: for<'de> Deserialize<'de>>(
    root: &Path,
    store: &str,
    title: &str,
    line: impl Fn(&T) -> String,
) -> AppResult<()> {
    let data = root.join(DATA_DIR);
    let path = data.join(format!("{store}.json"));
    if !path.is_file() {
        return Ok(());
    }
    let Ok(items) = serde_json::from_str::<Vec<T>>(&fs::read_to_string(&path)?) else {
        return Ok(());
    };
    if !items.is_empty() {
        let body: Vec<String> = items.iter().map(line).collect();
        let rel = notes::create_note(root, "", title)?;
        notes::write_note(root, &rel, &format!("# {title}\n\n{}\n", body.join("\n")))?;
    }
    let singular = store.trim_end_matches('s');
    for name in [format!("{store}.json"), format!("{singular}_tags.json")] {
        let file = data.join(&name);
        if file.is_file() {
            fs::rename(&file, data.join(format!("{name}.archived")))?;
        }
    }
    Ok(())
}

fn tag_suffix(tags: &[String]) -> String {
    tags.iter().map(|t| format!(" #{t}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn archives_stores_into_notes() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let data = dir.path().join(DATA_DIR);
        fs::write(
            data.join("todos.json"),
            r#"[{"id":"1","text":"Ship it","done":true,"createdAt":0,"tags":["work"]}]"#,
        )
        .unwrap();
        fs::write(data.join("todo_tags.json"), r#"["work"]"#).unwrap();
        fs::write(
            data.join("bookmarks.json"),
            r#"[{"id":"2","url":"https://ornata.app","title":"","createdAt":0}]"#,
        )
        .unwrap();

        archive_collections(dir.path()).unwrap();

        assert_eq!(
            notes::read_note(dir.path(), "Todos.md").unwrap(),
            "# Todos\n\n- [x] Ship it #work\n"
        );
        assert!(notes::read_note(dir.path(), "Bookmarks.md")
            .unwrap()
            .contains("- [https://ornata.app](https://ornata.app)"));
        assert!(!data.join("todos.json").exists());
        assert!(data.join("todos.json.archived").is_file());
        assert!(data.join("todo_tags.json.archived").is_file());
        assert!(data.join("bookmarks.json.archived").is_file());

        archive_collections(dir.path()).unwrap();
        assert!(notes::read_note(dir.path(), "Todos 2.md").is_err());
    }

    #[test]
    fn empty_store_is_archived_without_a_note() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        fs::write(dir.path().join(DATA_DIR).join("todos.json"), "[]").unwrap();
        archive_collections(dir.path()).unwrap();
        assert!(notes::read_note(dir.path(), "Todos.md").is_err());
        assert!(dir
            .path()
            .join(DATA_DIR)
            .join("todos.json.archived")
            .is_file());
    }
}
