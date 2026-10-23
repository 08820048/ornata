import type { EditorView } from "@tiptap/pm/view";

/**
 * Zed-style cursor movement animation for the WYSIWYG editor.
 *
 * The native caret can't be animated, so when this is enabled the caret is
 * drawn by us: a small SVG quad whose four corners each follow a critically
 * damped spring toward the caret's new location. Because the corners are
 * ranked by how much they lead the travel direction, fast/long moves give a
 * slight Neovide-style lean; the corners stay a parallelogram on slow moves.
 *
 * Performance notes:
 * - Coordinates are read once per selection/doc change (`coordsAtPos`), never
 *   per frame. Frame work is transform/attribute-only, so it stays off layout.
 * - The rAF loop runs only while a spring is actually moving, then stops.
 * - The overlay lives inside `.note-page`, so it scrolls with the content for
 *   free — no scroll handlers.
 *
 * Physics and corner-ranking are adapted from Zed's `cursor_animation.rs`
 * (itself adapted from vscode-neovide-cursor / Neovide, MIT).
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Corner offsets within the caret, from its center, in [-0.5, 0.5]. */
const CORNER_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

const BAR_WIDTH = 2;
/** Corner radius of the block caret, px. */
const BLOCK_RADIUS = 2;
/** Horizontal travel (px) at or below which a move counts as "short". */
const SHORT_MOVE_PX = 14;
const LONG_LENGTH_SECONDS = 0.125;
const SHORT_LENGTH_SECONDS = 0.05;
/** Above this animation length we clear velocity instead of keeping momentum. */
const RESET_THRESHOLD_SECONDS = 0.075;
const MAX_FRAME_SECONDS = 0.033;
const RESET_EPSILON = 0.001;
const ACTIVE_EPSILON = 0.01;
/** Per-corner timing multiplier by rank (0 = leading, 3 = trailing). */
const RANK_FACTORS = [1, 0.9, 0.5, 0.3];

export interface Spring {
  /** Offset from the target (target - current). Decays to 0. */
  offset: number;
  velocity: number;
}

/**
 * Advance one critically damped spring by `dt` seconds over an animation of
 * `length` seconds. Returns whether it is still meaningfully moving.
 */
export function stepSpring(spring: Spring, dt: number, length: number): boolean {
  if (
    !Number.isFinite(dt) ||
    dt < 0 ||
    !Number.isFinite(length) ||
    length <= dt ||
    Math.abs(spring.offset) < RESET_EPSILON
  ) {
    spring.offset = 0;
    spring.velocity = 0;
    return false;
  }
  if (dt === 0) return Math.abs(spring.offset) >= ACTIVE_EPSILON;

  const omega = 4 / length;
  const initial = spring.offset;
  const combined = spring.offset * omega + spring.velocity;
  const decay = Math.exp(-omega * dt);
  spring.offset = (initial + combined * dt) * decay;
  spring.velocity =
    decay *
    (-initial * omega - combined * dt * omega + combined);

  if (
    !Number.isFinite(spring.offset) ||
    !Number.isFinite(spring.velocity) ||
    Math.abs(spring.offset) < RESET_EPSILON
  ) {
    spring.offset = 0;
    spring.velocity = 0;
    return false;
  }
  return Math.abs(spring.offset) >= ACTIVE_EPSILON;
}

/**
 * Rank the four corners 0..3 by alignment with the travel direction. The
 * leading corner gets rank 0 (full-length spring); trailing corners are
 * progressively snappier, which produces the deformation.
 */
export function rankCorners(travelX: number, travelY: number): number[] {
  const distance = Math.hypot(travelX, travelY);
  const dirX = distance > 1e-4 ? travelX / distance : 0;
  const dirY = distance > 1e-4 ? travelY / distance : 0;
  const ranks = [0, 0, 0, 0];
  CORNER_OFFSETS.map(([x, y], index) => ({
    index,
    alignment: x * dirX + y * dirY,
  }))
    .sort((a, b) => b.alignment - a.alignment)
    .forEach((entry, rank) => {
      ranks[entry.index] = rank;
    });
  return ranks;
}

interface Corner {
  curX: number;
  curY: number;
  tgtX: number;
  tgtY: number;
  springX: Spring;
  springY: Spring;
  length: number;
}

interface CaretRect {
  x: number;
  y: number;
  h: number;
  w: number;
}

/** Closed path through four points with each corner rounded to `radius`. */
export function roundedPath(
  points: ReadonlyArray<{ x: number; y: number }>,
  radius: number,
): string {
  const n = points.length;
  const at = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const t = len > 1e-6 ? Math.min(radius / len, 0.5) : 0;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const a = at(p, points[(i + n - 1) % n]);
    const b = at(p, points[(i + 1) % n]);
    d += `${i === 0 ? "M" : "L"}${a.x.toFixed(2)},${a.y.toFixed(2)} Q${p.x.toFixed(2)},${p.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)} `;
  }
  return `${d}Z`;
}

export interface CursorMotionOptions {
  enabled?: boolean;
}

export class CursorMotion {
  private readonly view: EditorView;
  private readonly container: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly shape: SVGPathElement;
  private readonly corners: Corner[] = CORNER_OFFSETS.map(() => ({
    curX: 0,
    curY: 0,
    tgtX: 0,
    tgtY: 0,
    springX: { offset: 0, velocity: 0 },
    springY: { offset: 0, velocity: 0 },
    length: LONG_LENGTH_SECONDS,
  }));

  private enabled: boolean;
  private radius = 0;
  private visible = false;
  private composing = false;
  private destroyed = false;
  private raf = 0;
  private lastFrame = 0;
  private lastHead: number | null = null;
  private lastRect: CaretRect | null = null;
  private observedWidth: number | null = null;
  private readonly resizeObserver: ResizeObserver | null;

  constructor(view: EditorView, container: HTMLElement, options: CursorMotionOptions = {}) {
    this.view = view;
    this.container = container;
    this.enabled = options.enabled ?? true;

    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("class", "cursor-motion");
    this.svg.setAttribute("aria-hidden", "true");
    this.shape = document.createElementNS(SVG_NS, "path");
    this.svg.appendChild(this.shape);
    this.container.appendChild(this.svg);

    view.dom.addEventListener("compositionstart", this.onCompositionStart);
    view.dom.addEventListener("compositionend", this.onCompositionEnd);
    view.dom.addEventListener("focus", this.onFocus);
    view.dom.addEventListener("blur", this.onBlur);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? null;
        if (width === null) return;
        // Only a width change reflows lines; a height change is just content
        // growing and must not interrupt the animation.
        if (this.observedWidth !== null && Math.abs(width - this.observedWidth) > 0.5) {
          this.sync(true);
        }
        this.observedWidth = width;
      });
      this.resizeObserver.observe(view.dom);
    } else {
      this.resizeObserver = null;
    }

    // A late webfont load reflows every line; re-measure once it's ready.
    void document.fonts?.ready.then(() => {
      if (!this.destroyed) this.sync(true);
    });
  }

  /** Recompute the caret from the current selection and animate toward it. */
  sync(forceSnap = false) {
    if (this.destroyed || this.view.isDestroyed) return;
    if (!this.enabled || this.composing) {
      this.hide();
      return;
    }
    const { selection } = this.view.state;
    if (!this.view.hasFocus() || !selection.empty) {
      this.hide();
      return;
    }

    const head = selection.head;
    const coords = this.view.coordsAtPos(head);
    if (!coords) {
      this.hide();
      return;
    }
    const rect = this.container.getBoundingClientRect();
    const h = coords.bottom - coords.top;
    // A palette may ask for a block caret over the next character
    // (`--caret-block: 1`); otherwise a 2px bar centred on the caret boundary,
    // like the native caret.
    const block =
      getComputedStyle(this.container).getPropertyValue("--caret-block").trim() === "1";
    this.radius = block ? BLOCK_RADIUS : 0;
    const w = block ? this.blockWidth(head, coords, h) : BAR_WIDTH;
    const x = coords.left - rect.left - (block ? 0 : w / 2);
    const y = coords.top - rect.top;
    // Reject degenerate rects (e.g. coords inside an atom/leaf) rather than
    // drawing a caret with a nonsense shape.
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(h) ||
      h <= 1 ||
      h > 240
    ) {
      this.hide();
      return;
    }

    const target = CORNER_OFFSETS.map(([cx, cy]) => ({
      x: x + (0.5 + cx) * w,
      y: y + (0.5 + cy) * h,
    }));

    this.show();

    const previousRect = this.lastRect;
    if (forceSnap || this.lastHead === null || previousRect === null) {
      this.snapTo(target, head, { x, y, h, w });
      return;
    }

    const geometryChanged =
      Math.abs(previousRect.x - x) > 0.01 ||
      Math.abs(previousRect.y - y) > 0.01 ||
      Math.abs(previousRect.h - h) > 0.01 ||
      Math.abs(previousRect.w - w) > 0.01;

    if (this.lastHead !== head) {
      this.retarget(target, x, y, previousRect);
      this.lastHead = head;
      this.lastRect = { x, y, h, w };
      this.start();
      return;
    }

    // Same logical position but the glyph box moved (reflow / font change):
    // animating would be misleading, so snap.
    if (geometryChanged) {
      this.snapTo(target, head, { x, y, h, w });
    }
  }

  destroy() {
    this.destroyed = true;
    this.stop();
    this.view.dom.removeEventListener("compositionstart", this.onCompositionStart);
    this.view.dom.removeEventListener("compositionend", this.onCompositionEnd);
    this.view.dom.removeEventListener("focus", this.onFocus);
    this.view.dom.removeEventListener("blur", this.onBlur);
    this.resizeObserver?.disconnect();
    this.view.dom.classList.remove("caret-hidden");
    this.svg.remove();
  }

  private readonly onCompositionStart = () => {
    this.composing = true;
    this.hide();
  };

  private readonly onCompositionEnd = () => {
    this.composing = false;
    this.sync(true);
  };

  private readonly onFocus = () => {
    this.sync();
  };

  private readonly onBlur = () => {
    this.hide();
    this.stop();
  };

  private retarget(
    target: ReadonlyArray<{ x: number; y: number }>,
    x: number,
    y: number,
    previous: CaretRect,
  ) {
    const travelX = x - previous.x;
    const travelY = y - previous.y;
    const ranks = rankCorners(travelX, travelY);
    const shortMove = Math.abs(travelX) <= SHORT_MOVE_PX && Math.abs(travelY) < 0.5;
    const base = shortMove
      ? Math.min(LONG_LENGTH_SECONDS, SHORT_LENGTH_SECONDS)
      : LONG_LENGTH_SECONDS;

    this.corners.forEach((corner, index) => {
      corner.tgtX = target[index].x;
      corner.tgtY = target[index].y;
      corner.length = base * RANK_FACTORS[Math.min(ranks[index], 3)];
      if (corner.length > RESET_THRESHOLD_SECONDS) {
        corner.springX.offset = 0;
        corner.springX.velocity = 0;
        corner.springY.offset = 0;
        corner.springY.velocity = 0;
      }
      // Keep velocity on short/retargeted moves so rapid typing and arrow
      // key repeats carry momentum instead of restarting from a dead stop.
      corner.springX.offset = corner.tgtX - corner.curX;
      corner.springY.offset = corner.tgtY - corner.curY;
    });
  }

  private snapTo(
    target: ReadonlyArray<{ x: number; y: number }>,
    head: number,
    rect: CaretRect,
  ) {
    this.corners.forEach((corner, index) => {
      corner.curX = corner.tgtX = target[index].x;
      corner.curY = corner.tgtY = target[index].y;
      corner.springX.offset = 0;
      corner.springX.velocity = 0;
      corner.springY.offset = 0;
      corner.springY.velocity = 0;
    });
    this.lastHead = head;
    this.lastRect = rect;
    this.stop();
    this.render(false);
  }

  private start() {
    if (this.raf) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private stop() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private readonly tick = (now: number) => {
    const dt = Math.min((now - this.lastFrame) / 1000, MAX_FRAME_SECONDS);
    this.lastFrame = now;
    let active = false;
    for (const corner of this.corners) {
      const activeX = stepSpring(corner.springX, dt, corner.length);
      const activeY = stepSpring(corner.springY, dt, corner.length);
      corner.curX = corner.tgtX - corner.springX.offset;
      corner.curY = corner.tgtY - corner.springY.offset;
      active = active || activeX || activeY;
    }
    this.render(active);
    if (active) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.raf = 0;
    }
  };

  /** Width of the character after `head` on the caret's line, for the block
   *  caret; half an em at a line end or across a wrap. */
  private blockWidth(
    head: number,
    coords: { left: number; top: number },
    h: number,
  ): number {
    const fallback = Math.round(h * 0.55);
    try {
      const next = this.view.coordsAtPos(head + 1, -1);
      const width = next.left - coords.left;
      if (Math.abs(next.top - coords.top) < h / 2 && width > 1 && width < h * 2.5) {
        return width;
      }
    } catch {
      // head + 1 outside the document
    }
    return fallback;
  }

  private render(moving: boolean) {
    this.shape.setAttribute(
      "d",
      roundedPath(
        this.corners.map((c) => ({ x: c.curX, y: c.curY })),
        this.radius,
      ),
    );
    this.svg.dataset.moving = moving ? "true" : "false";
  }

  private show() {
    if (this.visible) return;
    this.visible = true;
    this.svg.dataset.visible = "true";
    this.view.dom.classList.add("caret-hidden");
  }

  private hide() {
    if (!this.visible) return;
    this.visible = false;
    this.svg.dataset.visible = "false";
    this.view.dom.classList.remove("caret-hidden");
  }
}
