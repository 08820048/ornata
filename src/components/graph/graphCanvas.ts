/**
 * Canvas plumbing shared by the full graph dialog and the local graph:
 * DPR-correct sizing, palette lookup, fitting and hit-testing, and the frame
 * loop that keeps painting while fades are in flight.
 */

import type { Palette, SimNode } from "./graphPaint";

export interface View {
  x: number;
  y: number;
  k: number;
}

/** Size the backing store to the element at device pixel ratio. Null while
 *  the canvas has no layout box (e.g. in a hidden tab pane). */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/** Read per paint, so a theme switch shows up on the next frame. */
export function readPalette(): Palette {
  return {
    ink: cssVar("--ink", "#191919"),
    muted: cssVar("--muted", "#6e6e6a"),
    faint: cssVar("--faint", "#a3a39e"),
    line: cssVar("--line", "#e3e3e0"),
    bg: cssVar("--bg", "#fbfbfa"),
    sunken: cssVar("--sunken", "#e9e9e6"),
    groups: [1, 2, 3, 4].map((n) => cssVar(`--graph-${n}`, "")).filter(Boolean),
    font: cssVar("--font-sans", "system-ui, sans-serif"),
  };
}

/** Frame every node that passes `visible`, centered, zoom clamped to
 *  [minZoom, maxZoom]. Null when nothing is visible. */
export function fitView(
  nodes: SimNode[],
  width: number,
  height: number,
  visible: (node: SimNode) => boolean,
  { padding, minZoom, maxZoom }: { padding: number; minZoom: number; maxZoom: number },
): View | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    if (!visible(node)) continue;
    minX = Math.min(minX, node.x - node.r);
    minY = Math.min(minY, node.y - node.r);
    maxX = Math.max(maxX, node.x + node.r);
    maxY = Math.max(maxY, node.y + node.r);
  }
  if (minX === Infinity) return null;
  const k = Math.min(
    maxZoom,
    Math.max(
      minZoom,
      Math.min(
        (width - padding * 2) / Math.max(maxX - minX, 1),
        (height - padding * 2) / Math.max(maxY - minY, 1),
      ),
    ),
  );
  return {
    k,
    x: width / 2 - ((minX + maxX) / 2) * k,
    y: height / 2 - ((minY + maxY) / 2) * k,
  };
}

/** Nearest visible node under a canvas-local point, with a small grace ring
 *  so tiny dots stay easy to hit. */
export function nodeAtPoint(
  nodes: SimNode[],
  view: View,
  px: number,
  py: number,
  visible: (node: SimNode) => boolean,
): SimNode | null {
  let best: SimNode | null = null;
  let bestDist = Infinity;
  for (const node of nodes) {
    if (!visible(node)) continue;
    const dist = Math.hypot(px - (node.x * view.k + view.x), py - (node.y * view.k + view.y));
    if (dist < Math.max(node.r + 3, 8) && dist < bestDist) {
      best = node;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Calls `paint(dt)` now, and again every animation frame for as long as it
 * reports fades still settling — at most one frame in flight. `dt` is the
 * time since the previous frame of the same fade (a fresh fade starts from a
 * normal 16ms step, never from the idle gap).
 */
export class FadeLoop {
  private frame = 0;
  private last: number | null = null;

  constructor(private readonly paint: (dt: number) => boolean) {}

  draw = () => {
    const now = performance.now();
    const dt = this.last === null ? 16 : Math.min(64, now - this.last);
    if (this.paint(dt)) {
      this.last = now;
      if (this.frame === 0) {
        this.frame = requestAnimationFrame(() => {
          this.frame = 0;
          this.draw();
        });
      }
    } else {
      this.last = null;
    }
  };

  cancel() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.last = null;
  }
}
