/**
 * Canvas painting for the link graph: hover emphasis that eases between
 * states instead of snapping, labels that fade in with zoom by node
 * importance, placed greedily so they never overlap, and optional folder
 * regions drawn beneath everything.
 */

import { convexHull, type Point } from "./graphGroups";

export interface SimNode {
  rel: string;
  title: string;
  x: number;
  y: number;
  r: number;
  degree: number;
  isolated: boolean;
  /** d3-force pin: set while the node is being dragged. */
  fx?: number | null;
  fy?: number | null;
  /** Top-level folder, for folder regions (see graphGroups). */
  group?: string | null;
  /** Current eased fill and label opacity; seeded on first paint. */
  tint?: Tint;
  labelAlpha?: number;
  /** Cached label width for `labelFont`. */
  labelWidth?: number;
  labelFont?: string;
}

/** `from`/`to` keep the rel strings for drawing and hover; d3-force rewrites
 *  its own source/target fields into node objects as the simulation runs. */
export interface SimEdge {
  from: string;
  to: string;
  source: unknown;
  target: unknown;
  tint?: Tint;
}

interface Tint {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Palette {
  ink: string;
  muted: string;
  faint: string;
  line: string;
  bg: string;
  sunken: string;
  font: string;
}

export interface PaintInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  nodes: SimNode[];
  edges: SimEdge[];
  view: { x: number; y: number; k: number };
  hover: string | null;
  /** The note being read: drawn in ink with a ring, always labeled. */
  focus?: string | null;
  /** Labeled regardless of zoom (the local graph's direct neighbors). */
  alwaysLabel?: ReadonlySet<string>;
  showIsolated: boolean;
  /** Draw each folder's notes on a shared recessed region. */
  groups?: boolean;
  palette: Palette;
  /** ms since the previous paint of an ongoing fade; 0 snaps to targets. */
  dt: number;
}

/** Exponential ease time constant: lands (within snap tolerance) in ~140ms. */
const FADE_TAU_MS = 32;
/** A node's label starts to show once `r * zoom` passes START, and is fully
 *  shown RANGE later — hubs label early, leaves only when zoomed in. */
const LABEL_FADE_START = 5.5;
const LABEL_FADE_RANGE = 3;
/** Label opacity kept for notes outside the hovered neighborhood. */
const DIMMED_LABEL = 0.12;
const LABEL_SIZE = 11;
const LABEL_GAP = 4;
const LABEL_PAD = 2;
const CELL = 64;
/** Region margin beyond the largest dot in the folder (screen px). */
const HULL_MARGIN = 9;
const GROUP_LABEL_SIZE = 10.5;
/** A folder name shows once its region is this wide on screen, fully
 *  after RANGE more — so names appear as you zoom into a folder. */
const GROUP_LABEL_START = 90;
const GROUP_LABEL_RANGE = 60;

/** Paint one frame. Returns true while any fade is still in progress. */
export function paintGraph(input: PaintInput): boolean {
  const { ctx, width, height, nodes, edges, view, hover, showIsolated, palette } = input;
  const focus = input.focus ?? null;
  const { x: vx, y: vy, k } = view;
  const ease = input.dt <= 0 ? 1 : 1 - Math.exp(-input.dt / FADE_TAU_MS);
  let settling = false;

  const ink = rgb(palette.ink);
  const muted = rgb(palette.muted);
  const faint = rgb(palette.faint);
  const line = rgb(palette.line);

  const neighbors = new Set<string>();
  if (hover) {
    for (const edge of edges) {
      if (edge.from === hover) neighbors.add(edge.to);
      if (edge.to === hover) neighbors.add(edge.from);
    }
  }
  const byRel = new Map(nodes.map((n) => [n.rel, n]));
  const visible = (n: SimNode) => showIsolated || !n.isolated;

  const approach = (current: Tint | undefined, target: Tint): Tint => {
    if (!current) return { ...target };
    const next = {
      r: current.r + (target.r - current.r) * ease,
      g: current.g + (target.g - current.g) * ease,
      b: current.b + (target.b - current.b) * ease,
      a: current.a + (target.a - current.a) * ease,
    };
    const far =
      Math.abs(target.a - next.a) > 0.01 ||
      Math.abs(target.r - next.r) + Math.abs(target.g - next.g) + Math.abs(target.b - next.b) >
        3;
    if (!far) return { ...target };
    settling = true;
    return next;
  };

  ctx.clearRect(0, 0, width, height);

  const groupLabels = input.groups
    ? paintGroups(ctx, nodes, view, visible, palette.sunken)
    : [];

  // Edges: the hovered note's edges go last, on top of everything else.
  ctx.lineWidth = 1;
  const touching = (edge: SimEdge) => hover !== null && (edge.from === hover || edge.to === hover);
  for (const pass of [false, true]) {
    for (const edge of edges) {
      if (touching(edge) !== pass) continue;
      const a = byRel.get(edge.from);
      const b = byRel.get(edge.to);
      if (!a || !b || !visible(a) || !visible(b)) continue;
      const target = pass
        ? { ...muted, a: 1 }
        : { ...line, a: hover === null ? 1 : 0.4 };
      edge.tint = approach(edge.tint, target);
      ctx.strokeStyle = css(edge.tint);
      ctx.beginPath();
      ctx.moveTo(a.x * k + vx, a.y * k + vy);
      ctx.lineTo(b.x * k + vx, b.y * k + vy);
      ctx.stroke();
    }
  }

  // Nodes, collecting label candidates as we go.
  const labels: { node: SimNode; x: number; y: number; priority: number }[] = [];
  for (const node of nodes) {
    if (!visible(node)) continue;
    const x = node.x * k + vx;
    const y = node.y * k + vy;
    const isHover = node.rel === hover;
    const isFocus = node.rel === focus;
    const isNeighbor = hover !== null && neighbors.has(node.rel);
    const dimmed = hover !== null && !isHover && !isNeighbor && !isFocus;
    const target =
      isHover || isFocus
      ? { ...ink, a: 1 }
      : dimmed
        ? { ...faint, a: 0.35 }
        : { ...(node.isolated ? faint : muted), a: 1 };
    node.tint = approach(node.tint, target);

    const zoomAlpha = clamp01((node.r * k - LABEL_FADE_START) / LABEL_FADE_RANGE);
    const baseLabel = input.alwaysLabel?.has(node.rel) ? 1 : zoomAlpha;
    const labelTarget =
      isHover || isNeighbor || isFocus ? 1 : dimmed ? baseLabel * DIMMED_LABEL : baseLabel;
    const labelNow =
      node.labelAlpha === undefined
        ? labelTarget
        : node.labelAlpha + (labelTarget - node.labelAlpha) * ease;
    if (Math.abs(labelTarget - labelNow) > 0.01) {
      settling = true;
      node.labelAlpha = labelNow;
    } else {
      node.labelAlpha = labelTarget;
    }

    ctx.fillStyle = css(node.tint);
    ctx.beginPath();
    ctx.arc(x, y, node.r, 0, Math.PI * 2);
    ctx.fill();
    if (isFocus) {
      // "You are here": a hairline ring just off the dot.
      ctx.strokeStyle = palette.ink;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, node.r + 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (node.labelAlpha > 0.02 && x > -200 && x < width + 20 && y > -20 && y < height + 20) {
      labels.push({ node, x, y, priority: isHover || isFocus ? 2 : isNeighbor ? 1 : 0 });
    }
  }

  // Labels: most important first; anything that would overlap a placed
  // label is skipped this frame.
  const font = `${LABEL_SIZE}px ${palette.font}`;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.bg;
  labels.sort((a, b) => b.priority - a.priority || b.node.r - a.node.r);
  const grid = new Map<string, Rect[]>();

  // Folder names claim their spot first; note labels route around them.
  if (groupLabels.length > 0) {
    ctx.font = `600 ${GROUP_LABEL_SIZE}px ${palette.font}`;
    ctx.textAlign = "center";
    for (const label of groupLabels) {
      const w = ctx.measureText(label.text).width;
      const rect: Rect = {
        x0: label.x - w / 2 - LABEL_PAD,
        y0: label.y - GROUP_LABEL_SIZE / 2 - LABEL_PAD,
        x1: label.x + w / 2 + LABEL_PAD,
        y1: label.y + GROUP_LABEL_SIZE / 2 + LABEL_PAD,
      };
      if (!place(grid, rect)) continue;
      ctx.globalAlpha = label.alpha;
      ctx.fillStyle = palette.faint;
      ctx.fillText(label.text, label.x, label.y);
    }
    ctx.textAlign = "start";
    ctx.globalAlpha = 1;
    ctx.font = font;
  }
  for (const { node, x, y, priority } of labels) {
    if (node.labelFont !== font || node.labelWidth === undefined) {
      node.labelWidth = ctx.measureText(node.title).width;
      node.labelFont = font;
    }
    // Clear the focus ring as well as the dot.
    const left = x + node.r + LABEL_GAP + (node.rel === focus ? 3.5 : 0);
    const rect: Rect = {
      x0: left - LABEL_PAD,
      y0: y - LABEL_SIZE / 2 - LABEL_PAD,
      x1: left + node.labelWidth + LABEL_PAD,
      y1: y + LABEL_SIZE / 2 + LABEL_PAD,
    };
    if (!place(grid, rect)) continue;
    // Halo in the page color keeps labels legible over edges.
    ctx.globalAlpha = node.labelAlpha ?? 0;
    ctx.strokeText(node.title, left, y);
    ctx.fillStyle = priority === 2 ? palette.ink : palette.muted;
    ctx.fillText(node.title, left, y);
  }
  ctx.globalAlpha = 1;

  return settling;
}

interface GroupLabel {
  text: string;
  x: number;
  y: number;
  alpha: number;
}

/**
 * Fill each folder's region: the convex hull of its dots, grown by a margin
 * and rounded — filling the polygon and stroking it with a round-joined line
 * as wide as twice the margin. Opaque, so overlapping regions merge instead
 * of stacking darker. Returns the folder names worth labeling.
 */
function paintGroups(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  view: { x: number; y: number; k: number },
  visible: (node: SimNode) => boolean,
  fill: string,
): GroupLabel[] {
  const members = new Map<string, { points: Point[]; maxR: number }>();
  for (const node of nodes) {
    if (!node.group || !visible(node)) continue;
    const entry = members.get(node.group) ?? { points: [], maxR: 0 };
    entry.points.push({ x: node.x * view.k + view.x, y: node.y * view.k + view.y });
    entry.maxR = Math.max(entry.maxR, node.r);
    members.set(node.group, entry);
  }

  const labels: GroupLabel[] = [];
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const [group, { points, maxR }] of members) {
    // A lone note is not a region.
    if (points.length < 2) continue;
    const hull = convexHull(points);
    const margin = maxR + HULL_MARGIN;
    ctx.lineWidth = margin * 2;
    ctx.beginPath();
    ctx.moveTo(hull[0].x, hull[0].y);
    for (const p of hull.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    for (const p of hull) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
    }
    const alpha = clamp01((maxX - minX + margin * 2 - GROUP_LABEL_START) / GROUP_LABEL_RANGE);
    if (alpha > 0.02) {
      labels.push({ text: group, x: (minX + maxX) / 2, y: minY - margin - 7, alpha });
    }
  }
  ctx.lineCap = "butt";
  return labels;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Claim `rect` in the spatial hash unless it overlaps an existing claim. */
function place(grid: Map<string, Rect[]>, rect: Rect): boolean {
  const cx0 = Math.floor(rect.x0 / CELL);
  const cx1 = Math.floor(rect.x1 / CELL);
  const cy0 = Math.floor(rect.y0 / CELL);
  const cy1 = Math.floor(rect.y1 / CELL);
  for (let cx = cx0; cx <= cx1; cx += 1) {
    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (const other of grid.get(`${cx},${cy}`) ?? []) {
        if (rect.x0 < other.x1 && rect.x1 > other.x0 && rect.y0 < other.y1 && rect.y1 > other.y0) {
          return false;
        }
      }
    }
  }
  for (let cx = cx0; cx <= cx1; cx += 1) {
    for (let cy = cy0; cy <= cy1; cy += 1) {
      const key = `${cx},${cy}`;
      const cell = grid.get(key);
      if (cell) cell.push(rect);
      else grid.set(key, [rect]);
    }
  }
  return true;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function css(tint: Tint): string {
  return `rgba(${Math.round(tint.r)},${Math.round(tint.g)},${Math.round(tint.b)},${tint.a.toFixed(3)})`;
}

const rgbCache = new Map<string, { r: number; g: number; b: number }>();

/** Parse a `#rgb`/`#rrggbb` token (all palette tokens are hex). */
function rgb(hex: string): { r: number; g: number; b: number } {
  const cached = rgbCache.get(hex);
  if (cached) return cached;
  let digits = hex.trim().replace(/^#/, "");
  if (digits.length === 3) digits = [...digits].map((c) => c + c).join("");
  const value = Number.parseInt(digits.slice(0, 6), 16);
  const parsed = Number.isNaN(value)
    ? { r: 128, g: 128, b: 128 }
    : { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  rgbCache.set(hex, parsed);
  return parsed;
}
