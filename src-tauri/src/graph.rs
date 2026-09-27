//! The vault's link graph: notes as nodes, internal links as edges.
//!
//! One whole-vault scan (same cost class as backlinks/tags). Wiki targets are
//! fragment-stripped before disambiguation — `[[note#heading]]` links the
//! note, not a file named `note#heading`. Self-references and links that
//! leave the vault are dropped.

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::backlinks::{href_to_rel, markdown_hrefs, strip_md, wiki_targets};
use std::collections::{HashMap, HashSet};
use crate::error::AppResult;
use crate::vault::{notes_root, rel_of};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub rel: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// Build the note graph for the whole vault, sorted by rel for stable output.
pub fn link_graph(root: &Path) -> AppResult<LinkGraph> {
    let mut links: Vec<(String, Vec<String>)> = Vec::new(); // (rel, outgoing targets)
    collect_links(root, &notes_root(root), &mut links)?;
    links.sort_by(|a, b| a.0.cmp(&b.0));

    // Resolve wiki targets the way the frontend does: full rel first, then
    // unique basename anywhere in the vault.
    let by_rel: HashMap<String, String> = links
        .iter()
        .map(|(rel, _)| (strip_md(rel).to_lowercase(), rel.clone()))
        .collect();
    let mut by_name: HashMap<String, Vec<String>> = HashMap::new();
    for (rel, _) in &links {
        let base = strip_md(rel).rsplit('/').next().unwrap_or("").to_lowercase();
        by_name.entry(base).or_default().push(rel.clone());
    }

    let mut nodes: Vec<GraphNode> = links
        .iter()
        .map(|(rel, _)| GraphNode {
            title: strip_md(rel).rsplit('/').next().unwrap_or(rel).to_string(),
            rel: rel.clone(),
        })
        .collect();

    let mut seen_edges: HashSet<(String, String)> = HashSet::new();
    let mut edges: Vec<GraphEdge> = Vec::new();
    for (rel, targets) in &links {
        for target in targets {
            let Some(to) = resolve_target(target, &by_rel, &by_name) else {
                continue;
            };
            if to == *rel {
                continue;
            }
            if seen_edges.insert((rel.clone(), to.clone())) {
                edges.push(GraphEdge {
                    from: rel.clone(),
                    to,
                });
            }
        }
    }

    // Nodes with no edges stay in the list — the frontend decides whether to
    // render isolated notes (they matter for "everything is connected" checks
    // and cost nothing to filter client-side).
    nodes.sort_by(|a, b| a.rel.cmp(&b.rel));
    Ok(LinkGraph { nodes, edges })
}

fn resolve_target(
    normalized: &str,
    by_rel: &HashMap<String, String>,
    by_name: &HashMap<String, Vec<String>>,
) -> Option<String> {
    if let Some(rel) = by_rel.get(normalized) {
        return Some(rel.clone());
    }
    let base = normalized.rsplit('/').next().unwrap_or(normalized).to_string();
    // Ambiguous basename (several notes share it) — the graph drops the edge
    // rather than guessing.
    match by_name.get(&base) {
        Some(candidates) if candidates.len() == 1 => Some(candidates[0].clone()),
        _ => None,
    }
}

fn split_fragment(target: &str) -> (&str, &str) {
    match target.find('#') {
        Some(i) => (&target[..i], &target[i + 1..]),
        None => (target, ""),
    }
}

fn collect_links(
    root: &Path,
    dir: &Path,
    links: &mut Vec<(String, Vec<String>)>,
) -> AppResult<()> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_links(root, &path, links)?;
            continue;
        }
        if path.extension().is_none_or(|e| e != "md") {
            continue;
        }
        let rel = rel_of(root, &path)?;
        let content = fs::read_to_string(&path).unwrap_or_default();
        let mut targets: Vec<String> = Vec::new();
        for line in content.lines() {
            // Markdown hrefs are percent-encoded and carry fragments; wiki
            // targets are raw. Both normalize to a lowercase extension-less
            // rel — markdown via href_to_rel, wiki via explicit strip.
            for href in markdown_hrefs(line) {
                if let Some(rel_path) = href_to_rel(href) {
                    targets.push(rel_path);
                }
            }
            for wiki in wiki_targets(line) {
                let (note_part, _) = split_fragment(wiki.trim());
                if note_part.is_empty() {
                    continue;
                }
                targets.push(strip_md(note_part).to_lowercase());
            }
        }
        links.push((rel, targets));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_folder, create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    fn edges_of(graph: &LinkGraph) -> Vec<(String, String)> {
        let mut list: Vec<(String, String)> = graph
            .edges
            .iter()
            .map(|e| (e.from.clone(), e.to.clone()))
            .collect();
        list.sort();
        list
    }

    #[test]
    fn builds_edges_from_markdown_and_wiki_links() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        create_folder(root, "", "projects").unwrap();
        let app = create_note(root, "projects", "app").unwrap();
        let spec = create_note(root, "projects", "spec").unwrap();
        let journal = create_note(root, "", "Journal").unwrap();
        write_note(root, &app, "see [spec](projects/spec.md)").unwrap();
        write_note(root, &spec, "back [[projects/app]] and [[projects/app#标题]]").unwrap();
        write_note(root, &journal, "[external](https://x.md) [[missing]] [[Journal]]").unwrap();

        let graph = link_graph(root).unwrap();
        assert_eq!(graph.nodes.len(), 3);
        let edges = edges_of(&graph);
        assert_eq!(
            edges,
            vec![
                ("projects/app.md".into(), "projects/spec.md".into()),
                ("projects/spec.md".into(), "projects/app.md".into()),
            ]
        );
        let _ = journal;
    }

    #[test]
    fn self_references_and_ambiguous_basenames_are_dropped() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        create_folder(root, "", "x").unwrap();
        create_folder(root, "", "y").unwrap();
        let a1 = create_note(root, "x", "dup").unwrap();
        let a2 = create_note(root, "y", "dup").unwrap();
        write_note(root, &a1, "[[dup]] self [[x/dup]]").unwrap();

        let graph = link_graph(root).unwrap();
        assert!(edges_of(&graph).is_empty());
        assert_eq!(graph.nodes.len(), 2);
        let _ = a2;
    }

    #[test]
    fn fragments_do_not_break_targets() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let target = create_note(root, "", "idea").unwrap();
        let a = create_note(root, "", "Journal").unwrap();
        write_note(root, &a, "[link](idea.md#标题)").unwrap();

        let graph = link_graph(root).unwrap();
        assert_eq!(edges_of(&graph).len(), 1);
        assert_eq!(graph.edges[0].to, target);
    }
}
