use super::*;
use crate::notes::{create_folder, create_note, write_note};
use crate::vault::ensure_layout;
use tempfile::tempdir;

struct Vault {
    _dir: tempfile::TempDir,
    root: std::path::PathBuf,
}

impl std::ops::Deref for Vault {
    type Target = std::path::Path;
    fn deref(&self) -> &std::path::Path {
        &self.root
    }
}

fn setup() -> Vault {
    let dir = tempdir().unwrap();
    let root = dir.path().to_path_buf();
    ensure_layout(&root).unwrap();
    Vault { _dir: dir, root }
}

fn content_of(root: &Path, rel: &str) -> String {
    fs::read_to_string(notes_root(root).join(rel)).unwrap()
}

#[test]
fn renames_repoint_markdown_links() {
    let root = setup();
    create_folder(&root, "", "projects").unwrap();
    let target = create_note(&root, "projects", "Big Idea").unwrap();
    let a = create_note(&root, "", "Journal").unwrap();
    write_note(
        &root,
        &a,
        "see [idea](projects/Big%20Idea.md) and [alt](projects/Big%20Idea.md#top)",
    )
    .unwrap();

    let outcome = crate::notes::rename_entry(&root, &target, "New Idea").unwrap();
    assert_eq!(
        content_of(&root, &a),
        "see [idea](projects/New%20Idea.md) and [alt](projects/New%20Idea.md#top)"
    );
    assert_eq!(outcome.rewrites.len(), 1);
    assert_eq!(outcome.rewrites[0].from, target);
    assert_eq!(outcome.rewrites[0].to, outcome.next);
    assert_eq!(outcome.files, vec![a.clone()]);
}

#[test]
fn moves_rewrite_links_from_anywhere() {
    let root = setup();
    create_folder(&root, "", "projects").unwrap();
    create_folder(&root, "", "archive").unwrap();
    let target = create_note(&root, "projects", "Idea").unwrap();
    let a = create_note(&root, "", "Journal").unwrap();
    write_note(&root, &a, "[x](projects/Idea.md) [[projects/Idea]]").unwrap();

    let outcome = crate::notes::move_entry(&root, &target, "archive").unwrap();
    assert_eq!(
        content_of(&root, &a),
        "[x](archive/Idea.md) [[archive/Idea]]"
    );
    assert_eq!(outcome.rewrites[0].from, "projects/Idea.md");
    assert_eq!(outcome.rewrites[0].to, outcome.next);
}

#[test]
fn folder_moves_rewrite_prefixes_inside_and_outside() {
    let root = setup();
    create_folder(&root, "", "projects").unwrap();
    create_folder(&root, "projects", "sub").unwrap();
    let a = create_note(&root, "projects", "Alpha").unwrap();
    let b = create_note(&root, "projects/sub", "Beta").unwrap();
    let outside = create_note(&root, "", "Journal").unwrap();
    write_note(
        &root,
        &outside,
        "[a](projects/Alpha.md) [b](projects/sub/Beta.md) ![pic](projects/pic.png)",
    )
    .unwrap();
    write_note(&root, &a, "[sibling](projects/sub/Beta.md)").unwrap();
    write_note(&root, &b, "[back](../Journal.md) [up](../../Outside.md)").unwrap();

    let outcome = crate::notes::rename_entry(&root, "projects", "work").unwrap();
    assert_eq!(
        content_of(&root, &outside),
        "[a](work/Alpha.md) [b](work/sub/Beta.md) ![pic](work/pic.png)"
    );
    assert_eq!(content_of(&root, "work/Alpha.md"), "[sibling](work/sub/Beta.md)");
    assert_eq!(content_of(&root, "work/sub/Beta.md"), "[back](../Journal.md) [up](../../Outside.md)");
    assert_eq!(outcome.rewrites.len(), 2); // Alpha + Beta
    assert!(outcome.files.contains(&outside));
    assert!(outcome.files.contains(&"work/Alpha.md".to_string()));
    // Beta only holds ../-relative links — vault-relative rewrites don't touch it.
    assert_eq!(outcome.files.len(), 2);
}

#[test]
fn bare_wiki_names_follow_unambiguous_renames_only() {
    let root = setup();
    create_folder(&root, "", "projects").unwrap();
    let target = create_note(&root, "projects", "app").unwrap();
    let a = create_note(&root, "", "Journal").unwrap();
    let b = create_note(&root, "", "Log").unwrap();
    write_note(&root, &a, "[[app]] [[app|alias]] [[projects/app]]").unwrap();
    write_note(&root, &b, "[[app]]").unwrap();

    crate::notes::rename_entry(&root, &target, "renamed app").unwrap();
    assert_eq!(
        content_of(&root, &a),
        "[[renamed app]] [[renamed app|alias]] [[projects/renamed app]]"
    );
    assert_eq!(content_of(&root, &b), "[[renamed app]]");
}

#[test]
fn wiki_fragments_survive_renames() {
    let root = setup();
    create_folder(&root, "", "projects").unwrap();
    let target = create_note(&root, "projects", "app").unwrap();
    let a = create_note(&root, "", "Journal").unwrap();
    write_note(&root, &a, "[[projects/app#概要]] [[projects/app#概要|别名]] [[app#概要]]").unwrap();

    crate::notes::rename_entry(&root, &target, "renamed").unwrap();
    assert_eq!(
        content_of(&root, &a),
        "[[projects/renamed#概要]] [[projects/renamed#概要|别名]] [[renamed#概要]]"
    );
}

#[test]
fn ambiguous_bare_wiki_names_are_left_alone() {
    let root = setup();
    create_folder(&root, "", "projects").unwrap();
    create_folder(&root, "", "archive").unwrap();
    let target = create_note(&root, "projects", "app").unwrap();
    let twin = create_note(&root, "archive", "app").unwrap();
    let a = create_note(&root, "", "Journal").unwrap();
    write_note(&root, &a, "[[app]]").unwrap();

    crate::notes::rename_entry(&root, &target, "renamed").unwrap();
    assert_eq!(content_of(&root, &a), "[[app]]");
    let _ = twin;
}

#[test]
fn frontmatter_is_preserved_verbatim() {
    let root = setup();
    let target = create_note(&root, "", "Idea").unwrap();
    let a = create_note(&root, "", "Journal").unwrap();
    write_note(
        &root,
        &a,
        "---\ntitle: [x](Idea.md)\nref: Idea.md\n---\n[link](Idea.md)",
    )
    .unwrap();

    let next = crate::notes::rename_entry(&root, &target, "New Idea").unwrap().next;
    rewrite_after_move(&root, &target, &next).unwrap();
    assert_eq!(
        content_of(&root, &a),
        "---\ntitle: [x](Idea.md)\nref: Idea.md\n---\n[link](New%20Idea.md)"
    );
}

#[test]
fn encoded_cjk_hrefs_are_repointed_and_reencoded() {
    let root = setup();
    create_folder(&root, "", "40-职业").unwrap();
    let target = create_note(&root, "40-职业", "面试").unwrap();
    let a = create_note(&root, "", "Journal").unwrap();
    write_note(
        &root,
        &a,
        "[x](40-%E8%81%8C%E4%B8%9A/%E9%9D%A2%E8%AF%95.md)",
    )
    .unwrap();

    crate::notes::rename_entry(&root, &target, "笔试").unwrap();
    assert_eq!(
        content_of(&root, &a),
        "[x](40-%E8%81%8C%E4%B8%9A/%E7%AC%94%E8%AF%95.md)"
    );
}

#[test]
fn external_links_and_fragments_are_untouched() {
    let root = setup();
    let target = create_note(&root, "", "Idea").unwrap();
    let a = create_note(&root, "", "Journal").unwrap();
    write_note(
        &root,
        &a,
        "[web](https://x/Idea.md) [mail](mailto:Idea.md) [frag](Idea.md#top) [q](Idea.md?v=2) [other](Stuff.md)",
    )
    .unwrap();
    let stuff = create_note(&root, "", "Stuff").unwrap();

    let next = crate::notes::rename_entry(&root, &target, "New Idea").unwrap().next;
    rewrite_after_move(&root, &target, &next).unwrap();
    assert_eq!(
        content_of(&root, &a),
        "[web](https://x/Idea.md) [mail](mailto:Idea.md) [frag](New%20Idea.md#top) [q](New%20Idea.md?v=2) [other](Stuff.md)"
    );
    let _ = stuff;
}

#[test]
fn split_frontmatter_mirrors_the_frontend() {
    assert_eq!(split_frontmatter("body only"), ("", "body only"));
    assert_eq!(
        split_frontmatter("---\na: b\n---\nbody"),
        ("---\na: b\n---\n", "body")
    );
    assert_eq!(split_frontmatter("---\na: b\n---"), ("---\na: b\n---", ""));
    // A `---` line directly under the opener is body, matching the regex.
    assert_eq!(split_frontmatter("---\n---\nbody"), ("", "---\n---\nbody"));
    assert_eq!(split_frontmatter("---\nunterminated"), ("", "---\nunterminated"));
}

#[test]
fn rel_to_href_matches_the_frontend_encoder() {
    assert_eq!(rel_to_href("projects/New Idea.md"), "projects/New%20Idea.md");
    assert_eq!(
        rel_to_href("40-职业/笔试.md"),
        "40-%E8%81%8C%E4%B8%9A/%E7%AC%94%E8%AF%95.md"
    );
    assert_eq!(
        rel_to_href("Lua 速查 (面试).md"),
        "Lua%20%E9%80%9F%E6%9F%A5%20(%E9%9D%A2%E8%AF%95).md"
    );
}
