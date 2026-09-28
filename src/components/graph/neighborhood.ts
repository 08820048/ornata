import type { LinkGraph } from "@/lib/types";

export interface Neighborhood {
  /** rel → hop distance from the center (0 = the center itself). */
  depth: Map<string, number>;
  /** Links between included notes, in either direction. */
  edges: { from: string; to: string }[];
  /** Vault-wide link count per included note (sizes the dots). */
  degree: Map<string, number>;
  /** Second-hop notes left out by `maxOuter`. */
  hidden: number;
}

/**
 * Notes within `maxDepth` links of `center`, following links both ways.
 * The outermost ring is capped at `maxOuter`, keeping the best-connected
 * notes, so a hub two hops away can't flood a small panel.
 */
export function neighborhood(
  graph: LinkGraph,
  center: string,
  maxDepth: 1 | 2,
  maxOuter = 60,
): Neighborhood {
  const adjacent = new Map<string, Set<string>>();
  const degree = new Map<string, number>();
  const link = (a: string, b: string) => {
    let set = adjacent.get(a);
    if (!set) adjacent.set(a, (set = new Set()));
    set.add(b);
  };
  for (const edge of graph.edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const depth = new Map<string, number>([[center, 0]]);
  let frontier = [center];
  let hidden = 0;
  for (let hop = 1; hop <= maxDepth; hop += 1) {
    const next = new Set<string>();
    for (const rel of frontier) {
      for (const other of adjacent.get(rel) ?? []) {
        if (!depth.has(other)) next.add(other);
      }
    }
    let ring = [...next];
    if (hop === maxDepth && hop > 1 && ring.length > maxOuter) {
      ring.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b));
      hidden = ring.length - maxOuter;
      ring = ring.slice(0, maxOuter);
    }
    for (const rel of ring) depth.set(rel, hop);
    frontier = ring;
  }

  const edges = graph.edges.filter((edge) => depth.has(edge.from) && depth.has(edge.to));
  const included = new Map<string, number>();
  for (const rel of depth.keys()) included.set(rel, degree.get(rel) ?? 0);
  return { depth, edges, degree: included, hidden };
}
