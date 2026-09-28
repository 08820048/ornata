import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ipc } from "@/lib/ipc";
import { vaultNote } from "@/lib/noteRef";
import type { LinkGraph } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useTabs } from "@/stores/tabs";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";

interface SimNode {
  rel: string;
  title: string;
  x: number;
  y: number;
  r: number;
  degree: number;
  isolated: boolean;
}

/** `from`/`to` keep the rel strings for drawing and hover; d3-force rewrites
 *  its own source/target fields into node objects as the simulation runs. */
interface SimEdge {
  from: string;
  to: string;
  source: unknown;
  target: unknown;
}

/** Pointer travel (px) under which a press on a node counts as a click. */
const CLICK_SLOP = 4;
/** Layout work per animation frame, so large vaults never freeze the window. */
const FRAME_BUDGET_MS = 10;
const MAX_TICKS = 320;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
/** Auto-fit never magnifies a small graph past this. */
const MAX_FIT_ZOOM = 1.5;
const FIT_PADDING = 48;

/**
 * The vault's link graph, laid out by d3-force and drawn on a plain canvas.
 * The simulation runs in time-sliced batches across animation frames, so the
 * graph settles into place instead of blocking; once it has settled only
 * hover/pan/zoom redraw. The view keeps fitting the layout until the user
 * pans or zooms. Isolated notes are hidden by default — they drown the
 * interesting structure in dots.
 */
export function GraphDialog() {
  const open = useUi((s) => s.graphOpen);
  const setOpen = useUi((s) => s.setGraphOpen);
  const [graph, setGraph] = useState<LinkGraph | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showIsolated, setShowIsolated] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<{ nodes: SimNode[]; edges: SimEdge[] } | null>(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const hoverRef = useRef<string | null>(null);
  /** A press in progress: last pointer position for panning, press origin
   *  for click detection, and the node (if any) it started on. */
  const dragRef = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    rel: string | null;
  } | null>(null);
  const autoFitRef = useRef(true);
  const showIsolatedRef = useRef(showIsolated);
  showIsolatedRef.current = showIsolated;
  const t = useT();

  useEffect(() => {
    if (!open) return;
    setGraph(null);
    setLoadError(false);
    setHovered(null);
    hoverRef.current = null;
    let cancelled = false;
    ipc
      .linkGraph()
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // On a capped graph the unlinked notes are not in the largest component, so
  // they have no coordinates until this is on. Smaller graphs already lay
  // every note out; there the same toggle only changes drawing.
  const layoutIsolates =
    (graph?.nodes.length ?? 0) > 2000 && !showAll && showIsolated;

  useEffect(() => {
    if (!graph) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    const degree = new Map<string, number>();
    for (const edge of graph.edges) {
      degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    }

    // Large vaults: lay out only the biggest connected component by default.
    // The synchronous pass would otherwise freeze the window.
    const capped = graph.nodes.length > 2000;
    let inMajor: Set<string> | null = null;
    if (capped) {
      const parent = new Map<string, string>();
      const find = (rel: string): string => {
        const p = parent.get(rel) ?? rel;
        if (p === rel) return rel;
        const root = find(p);
        parent.set(rel, root);
        return root;
      };
      const union = (a: string, b: string) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
      };
      for (const edge of graph.edges) union(edge.from, edge.to);
      const sizes = new Map<string, number>();
      for (const node of graph.nodes) {
        const rootRel = find(node.rel);
        sizes.set(rootRel, (sizes.get(rootRel) ?? 0) + 1);
      }
      let best = "";
      let bestSize = 0;
      for (const [rootRel, size] of sizes) {
        if (size > bestSize) {
          best = rootRel;
          bestSize = size;
        }
      }
      inMajor = new Set(graph.nodes.filter((n) => find(n.rel) === best).map((n) => n.rel));
    }

    // Growing this set re-lays out and resets the view. "Show all" adds every
    // other component. "Show unlinked" on a capped graph adds the degree-0
    // notes, which otherwise have nowhere to be drawn.
    const simmed = graph.nodes.filter((node) => {
      if (inMajor === null || showAll) return true;
      if (inMajor.has(node.rel)) return true;
      return layoutIsolates && (degree.get(node.rel) ?? 0) === 0;
    });
    const nodes: SimNode[] = simmed.map((node, index) => {
      const d = degree.get(node.rel) ?? 0;
      const angle = (index / simmed.length) * Math.PI * 2;
      return {
        rel: node.rel,
        title: node.title,
        x: width / 2 + Math.cos(angle) * Math.min(width, height) * 0.35,
        y: height / 2 + Math.sin(angle) * Math.min(width, height) * 0.35,
        // sqrt keeps hubs distinct without leaf notes all hitting the cap.
        r: Math.min(3.5 + Math.sqrt(d) * 2.2, 14),
        degree: d,
        isolated: d === 0,
      };
    });
    const byRel = new Map(nodes.map((n) => [n.rel, n]));
    const edges: SimEdge[] = graph.edges
      .filter((e) => byRel.has(e.from) && byRel.has(e.to))
      .map((e) => ({ from: e.from, to: e.to, source: e.from, target: e.to }));

    const sim = forceSimulation(nodes as never[])
      .force(
        "link",
        forceLink(edges as never[])
          .id((d: unknown) => (d as SimNode).rel)
          .distance(70)
          .strength(0.4),
      )
      .force("charge", forceManyBody().strength(-140))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide().radius((d: unknown) => (d as SimNode).r + 4))
      .stop();

    simRef.current = { nodes, edges };
    viewRef.current = { x: 0, y: 0, k: 1 };
    autoFitRef.current = true;
    // Tick in frame-sized slices until alpha decays; the view tracks the
    // spreading layout until the user takes over.
    let ticks = 0;
    let frame = 0;
    const step = () => {
      const start = performance.now();
      while (
        ticks < MAX_TICKS &&
        sim.alpha() > sim.alphaMin() &&
        performance.now() - start < FRAME_BUDGET_MS
      ) {
        sim.tick();
        ticks += 1;
      }
      if (autoFitRef.current) fitView();
      // Via the ref: toggles mid-layout change what draw() shows.
      drawRef.current();
      if (ticks < MAX_TICKS && sim.alpha() > sim.alphaMin()) {
        frame = requestAnimationFrame(step);
      }
    };
    step();
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, showAll, layoutIsolates]);

  const cssVar = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  /** Frame every visible node, centered, without magnifying tiny graphs. */
  const fitView = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of sim.nodes) {
      if (node.isolated && !showIsolatedRef.current) continue;
      minX = Math.min(minX, node.x - node.r);
      minY = Math.min(minY, node.y - node.r);
      maxX = Math.max(maxX, node.x + node.r);
      maxY = Math.max(maxY, node.y + node.r);
    }
    if (minX === Infinity) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const k = Math.min(
      MAX_FIT_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(
          (width - FIT_PADDING * 2) / Math.max(maxX - minX, 1),
          (height - FIT_PADDING * 2) / Math.max(maxY - minY, 1),
        ),
      ),
    );
    viewRef.current = {
      k,
      x: width / 2 - ((minX + maxX) / 2) * k,
      y: height / 2 - ((minY + maxY) / 2) * k,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const ink = cssVar("--ink", "#141413");
    const line = cssVar("--line", "#e5e3d8");
    const muted = cssVar("--muted", "#6b6a64");
    const faint = cssVar("--faint", "#b8b6ad");
    const font = cssVar("--font-sans", "system-ui, sans-serif");
    const hover = hoverRef.current;
    const neighbors = new Set<string>();
    if (hover) {
      for (const edge of sim.edges) {
        if (edge.from === hover) neighbors.add(edge.to);
        if (edge.to === hover) neighbors.add(edge.from);
      }
    }
    const byRel = new Map(sim.nodes.map((n) => [n.rel, n]));
    const visible = (n: SimNode) => showIsolated || !n.isolated;
    const { x: vx, y: vy, k } = viewRef.current;

    ctx.lineWidth = 1;
    // Two passes: the hovered note's edges go on top of everything else.
    for (const pass of [false, true]) {
      ctx.strokeStyle = pass ? muted : line;
      ctx.beginPath();
      for (const edge of sim.edges) {
        const highlighted =
          hover !== null && (edge.from === hover || edge.to === hover);
        if (highlighted !== pass) continue;
        const a = byRel.get(edge.from);
        const b = byRel.get(edge.to);
        if (!a || !b || !visible(a) || !visible(b)) continue;
        ctx.moveTo(a.x * k + vx, a.y * k + vy);
        ctx.lineTo(b.x * k + vx, b.y * k + vy);
      }
      ctx.stroke();
    }

    ctx.font = `11px ${font}`;
    for (const node of sim.nodes) {
      if (!visible(node)) continue;
      const x = node.x * k + vx;
      const y = node.y * k + vy;
      const isHover = node.rel === hover;
      const isNeighbor = hover !== null && neighbors.has(node.rel);
      const dimmed = hover !== null && !isHover && !isNeighbor;
      ctx.beginPath();
      ctx.arc(x, y, node.r, 0, Math.PI * 2);
      ctx.fillStyle = isHover
        ? ink
        : dimmed
          ? faint
          : node.isolated
            ? faint
            : muted;
      ctx.globalAlpha = dimmed ? 0.45 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (isHover || isNeighbor || node.r >= 8) {
        ctx.fillStyle = dimmed ? faint : muted;
        ctx.fillText(node.title, x + node.r + 3, y + 3.5);
      }
    }
  }, [showIsolated, showAll]);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (autoFitRef.current) fitView();
    draw();
  }, [hovered, showIsolated, showAll, draw, fitView]);

  // Canvas size follows the dialog; without this a window resize leaves a
  // stretched, blurry bitmap until the next hover.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      if (autoFitRef.current) fitView();
      draw();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [graph, draw, fitView]);

  // Native listener: React's onWheel is passive, so it can't preventDefault.
  // Trackpad conventions: two-finger scroll pans, pinch (ctrlKey) or
  // ⌘-scroll zooms around the cursor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      autoFitRef.current = false;
      const unit = event.deltaMode === 1 ? 16 : 1;
      const view = viewRef.current;
      if (event.ctrlKey || event.metaKey) {
        const rect = canvas.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        // Continuous factor: smooth for pinch deltas, capped per mouse notch.
        const delta = Math.max(-30, Math.min(30, event.deltaY * unit));
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * Math.exp(-delta * 0.01)));
        // Keep the point under the cursor stable while zooming.
        viewRef.current = {
          k: next,
          x: mx - ((mx - view.x) / view.k) * next,
          y: my - ((my - view.y) / view.k) * next,
        };
      } else {
        viewRef.current = {
          ...view,
          x: view.x - event.deltaX * unit,
          y: view.y - event.deltaY * unit,
        };
      }
      draw();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [graph, draw]);

  const nodeAt = (clientX: number, clientY: number): SimNode | null => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return null;
    const rect = canvas.getBoundingClientRect();
    const { x: vx, y: vy, k } = viewRef.current;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best: SimNode | null = null;
    let bestDist = Infinity;
    for (const node of sim.nodes) {
      if (node.isolated && !showIsolated) continue;
      const dx = px - (node.x * k + vx);
      const dy = py - (node.y * k + vy);
      const dist = Math.hypot(dx, dy);
      if (dist < Math.max(node.r + 3, 8) && dist < bestDist) {
        best = node;
        bestDist = dist;
      }
    }
    return best;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag) {
      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < CLICK_SLOP
      ) {
        return;
      }
      drag.moved = true;
      autoFitRef.current = false;
      viewRef.current.x += event.clientX - drag.x;
      viewRef.current.y += event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      draw();
      return;
    }
    const node = nodeAt(event.clientX, event.clientY);
    const rel = node?.rel ?? null;
    if (rel !== hoverRef.current) {
      hoverRef.current = rel;
      setHovered(rel);
    }
  };

  const openNote = (rel: string) => {
    setOpen(false);
    setTimeout(() => {
      const vault = useVault.getState();
      const note = vaultNote(rel);
      vault.expandTo(rel);
      vault.setView({ type: "note", note });
      useTabs.getState().requestScrollTop(note);
    }, 0);
  };

  const isolatedCount = useMemo(() => {
    if (!graph) return 0;
    const linked = new Set<string>();
    for (const edge of graph.edges) {
      linked.add(edge.from);
      linked.add(edge.to);
    }
    return graph.nodes.filter((n) => !linked.has(n.rel)).length;
  }, [graph]);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel={t("graph.aria")}
      className="w-[min(1100px,92vw)]"
    >
      <div className="flex flex-col">
        <div className="flex items-baseline justify-between border-b border-line-soft px-4 py-3">
          <span className="text-[13px] font-semibold text-ink">{t("graph.title")}</span>
          <span className="text-[11px] tabular-nums text-faint">
            {graph && `${graph.nodes.length} · ${graph.edges.length}`}
          </span>
        </div>
        <div className="relative h-[72vh]">
          {loadError ? (
            <p className="grid h-full place-items-center text-[13px] text-faint">
              {t("graph.loadFailed")}
            </p>
          ) : graph === null ? null : (
            <canvas
              ref={canvasRef}
              className="h-full w-full cursor-grab active:cursor-grabbing"
              onPointerMove={onPointerMove}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                // Capture so a pan that leaves the canvas still ends cleanly.
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  startX: event.clientX,
                  startY: event.clientY,
                  moved: false,
                  rel: nodeAt(event.clientX, event.clientY)?.rel ?? null,
                };
              }}
              onPointerUp={() => {
                const drag = dragRef.current;
                dragRef.current = null;
                // A press that never became a pan is a click on its node.
                if (drag && !drag.moved && drag.rel) openNote(drag.rel);
              }}
              onPointerCancel={() => (dragRef.current = null)}
              onPointerLeave={() => {
                if (dragRef.current) return;
                hoverRef.current = null;
                setHovered(null);
              }}
            />
          )}
          {graph && graph.nodes.length > 0 && isolatedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowIsolated((v) => !v)}
              className={cx(
                "absolute left-3 top-3 rounded-md border px-2.5 py-1 text-[11.5px] transition-colors duration-100",
                showIsolated
                  ? "border-line bg-active text-ink"
                  : "border-line-soft bg-panel text-faint hover:text-muted",
              )}
            >
              {t("graph.showIsolated")}
            </button>
          )}
          {graph && graph.nodes.length > 2000 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className={cx(
                "absolute left-3 top-12 rounded-md border px-2.5 py-1 text-[11.5px] transition-colors duration-100",
                showAll
                  ? "border-line bg-active text-ink"
                  : "border-line-soft bg-panel text-faint hover:text-muted",
              )}
            >
              {t("graph.showAll")}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

