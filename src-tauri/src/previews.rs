//! The opening text of notes, for the library view's cards. Reads only the
//! head of each file, so a folder of long notes stays cheap to preview.

use crate::error::AppResult;
use crate::vault::resolve_rel;
use serde::Serialize;
use std::fs::File;
use std::io::Read;
use std::path::Path;

/// How much of a file is read to find the body's opening.
const READ_BYTES: u64 = 16 * 1024;
/// How much body text a card can show.
const HEAD_CHARS: usize = 2400;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NoteHead {
    pub rel: String,
    pub text: String,
}

/// The first `HEAD_CHARS` characters of each note's body (frontmatter
/// skipped). Notes that can't be read are left out rather than failing the
/// whole batch — a card just stays blank.
pub fn note_heads(root: &Path, rels: &[String]) -> AppResult<Vec<NoteHead>> {
    let mut out = Vec::with_capacity(rels.len());
    for rel in rels {
        let Ok(path) = resolve_rel(root, rel) else {
            continue;
        };
        let Ok(file) = File::open(&path) else {
            continue;
        };
        let mut bytes = Vec::new();
        if file.take(READ_BYTES).read_to_end(&mut bytes).is_err() {
            continue;
        }
        // A read that stops mid-character leaves a broken tail; lossy decoding
        // turns it into one replacement char, which the truncation drops.
        let text = String::from_utf8_lossy(&bytes);
        out.push(NoteHead {
            rel: rel.clone(),
            text: head_of(&text),
        });
    }
    Ok(out)
}

fn head_of(text: &str) -> String {
    let body = skip_frontmatter(text).trim_start_matches(['\n', '\r']);
    body.chars()
        .take(HEAD_CHARS)
        .filter(|c| *c != char::REPLACEMENT_CHARACTER)
        .collect()
}

/// The text after a leading `---` YAML block, or all of it when there is none
/// (or the block never closes within what was read).
fn skip_frontmatter(text: &str) -> &str {
    let Some(rest) = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n")) else {
        return text;
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        offset += line.len();
        if line.trim_end() == "---" {
            return &rest[offset..];
        }
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn returns_the_body_without_frontmatter() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let rel = create_note(dir.path(), "", "Clip").unwrap();
        write_note(dir.path(), &rel, "---\ntitle: x\n---\n\n# Clip\n\nbody").unwrap();
        let heads = note_heads(dir.path(), std::slice::from_ref(&rel)).unwrap();
        assert_eq!(heads, vec![NoteHead { rel, text: "# Clip\n\nbody".into() }]);
    }

    #[test]
    fn keeps_text_whose_frontmatter_never_closes() {
        assert_eq!(head_of("---\nnot yaml\nstill body"), "---\nnot yaml\nstill body");
    }

    #[test]
    fn truncates_long_notes_on_a_character_boundary() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let rel = create_note(dir.path(), "", "Long").unwrap();
        write_note(dir.path(), &rel, &"笔记".repeat(20_000)).unwrap();
        let heads = note_heads(dir.path(), &[rel]).unwrap();
        assert_eq!(heads[0].text.chars().count(), HEAD_CHARS);
        assert!(heads[0].text.chars().all(|c| c == '笔' || c == '记'));
    }

    #[test]
    fn skips_missing_notes_and_paths_outside_the_vault() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let rel = create_note(dir.path(), "", "Here").unwrap();
        let heads =
            note_heads(dir.path(), &["gone.md".into(), "../../etc/passwd".into(), rel.clone()])
                .unwrap();
        assert_eq!(heads.len(), 1);
        assert_eq!(heads[0].rel, rel);
    }
}
