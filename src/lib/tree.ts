import type { TreeNode } from "@/lib/types";

/**
 * Modified-time ordering for one tree layer: notes by mtime descending,
 * folders keeping the backend's name order. Name mode returns the input
 * untouched — the backend already sorts it and locale re-sorting would
 * visually reshuffle non-ASCII names.
 */
export function sortChildren(nodes: TreeNode[], mode: TreeSort): TreeNode[] {
  if (mode === "name") return nodes;
  const folders = nodes.filter((node) => node.kind === "folder");
  const notes = nodes
    .filter((node) => node.kind === "note")
    .sort((a, b) => b.modifiedMs - a.modifiedMs);
  return [...folders, ...notes];
}

/** Depth-first list of every note in the tree (folders skipped). */
export function flattenNotes(tree: TreeNode[], out: TreeNode[] = []) {
  for (const node of tree) {
    if (node.kind === "note") out.push(node);
    if (node.children) flattenNotes(node.children, out);
  }
  return out;
}
