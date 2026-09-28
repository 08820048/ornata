/**
 * Graph search: which notes match a query, best first. Matches the vault
 * path (folder + title), so typing a folder name lights up the folder.
 */
export function searchNodes(
  nodes: readonly { rel: string; title: string; degree: number }[],
  query: string,
): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: { rel: string; rank: number; degree: number; title: string }[] = [];
  for (const node of nodes) {
    const title = node.title.toLowerCase();
    const path = node.rel.replace(/\.md$/i, "").toLowerCase();
    // Rank: title starts with the query, title contains it, path contains it.
    const rank = title.startsWith(needle) ? 0 : title.includes(needle) ? 1 : path.includes(needle) ? 2 : -1;
    if (rank >= 0) hits.push({ rel: node.rel, rank, degree: node.degree, title });
  }
  hits.sort(
    (a, b) => a.rank - b.rank || b.degree - a.degree || a.title.localeCompare(b.title),
  );
  return hits.map((hit) => hit.rel);
}
