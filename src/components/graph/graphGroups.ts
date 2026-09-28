/**
 * Folder grouping for the link graph: which group a note belongs to, a
 * gentle force that keeps folder-mates together, and the convex hull each
 * group is drawn as.
 */

/** Groups are top-level folders; nested folders would splinter the map.
 *  Notes at the vault root belong to no group. */
export function groupOf(rel: string): string | null {
  const slash = rel.indexOf("/");
  return slash > 0 ? rel.slice(0, slash) : null;
}

/** How many folders get a color; the rest stay gray. Four is the most the
 *  palette separates when any two regions may touch (validated all-pairs,
 *  both themes) — more would need hues people can't tell apart. */
export const FOLDER_COLORS = 4;

/**
 * Color slot per folder: the largest top-level folders across the whole
 * vault, in slot order (ties by name). Computed from every note, not the
 * visible subset, so view toggles never repaint a folder.
 */
export function folderSlots(rels: readonly string[], slots = FOLDER_COLORS): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const rel of rels) {
    const group = groupOf(rel);
    if (group) sizes.set(group, (sizes.get(group) ?? 0) + 1);
  }
  const ranked = [...sizes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return new Map(ranked.slice(0, slots).map(([group], index) => [group, index]));
}

interface GroupedNode {
  group?: string | null;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

/**
 * d3-force-compatible force pulling each grouped node toward its group's
 * current centroid. Weak on purpose: links still decide the shape, groups
 * only stop folders from interleaving into one another.
 */
export function forceGroup(strength = 0.1) {
  let nodes: GroupedNode[] = [];
  const force = (alpha: number) => {
    const sums = new Map<string, { x: number; y: number; n: number }>();
    for (const node of nodes) {
      if (!node.group) continue;
      const sum = sums.get(node.group) ?? { x: 0, y: 0, n: 0 };
      sum.x += node.x;
      sum.y += node.y;
      sum.n += 1;
      sums.set(node.group, sum);
    }
    const pull = strength * alpha;
    for (const node of nodes) {
      if (!node.group) continue;
      const sum = sums.get(node.group);
      if (!sum || sum.n < 2) continue;
      node.vx = (node.vx ?? 0) + (sum.x / sum.n - node.x) * pull;
      node.vy = (node.vy ?? 0) + (sum.y / sum.n - node.y) * pull;
    }
  };
  force.initialize = (next: GroupedNode[]) => {
    nodes = next;
  };
  return force;
}

export interface Point {
  x: number;
  y: number;
}

/** Convex hull (monotone chain), counter-clockwise, no repeated endpoint.
 *  Fewer than three distinct points come back as-is. */
export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
