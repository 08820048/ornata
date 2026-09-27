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
  hidden: boolean;
}

interface SimEdge {
  source: string;
  target: string;
}

/**
 * The vault's link graph, laid out by d3-force and drawn on a plain canvas.
 * The simulation runs a fixed number of ticks up front (no rAF loop); after
 * that only hover/pan/zoom redraw. Isolated notes are hidden by default —
 * they drown the interesting structure in dots.
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
  const dragRef = useRef<{ x: number; y: number } | null>(null);
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

    // Large vaults: keep only the biggest connected component by default —
    // the synchronous layout would otherwise freeze the window. "Show all"
    // reveals the rest (the simulation always contains every node, so the
    // toggle only changes what is drawn).
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

    const nodes: SimNode[] = graph.nodes.map((node, index) => {
      const d = degree.get(node.rel) ?? 0;
      const angle = (index / graph.nodes.length) * Math.PI * 2;
      return {
        rel: node.rel,
        title: node.title,
        x: width / 2 + Math.cos(angle) * Math.min(width, height) * 0.35,
        y: height / 2 + Math.sin(angle) * Math.min(width, height) * 0.35,
        r: Math.min(4 + d * 1.2, 13),
        degree: d,
        isolated: d === 0,
        hidden: Boolean(
          (d === 0 && !showIsolated) || (inMajor !== null && !inMajor.has(node.rel) && !showAll),
        ),
      };
    });
    const byRel = new Map(nodes.map((n) => [n.rel, n]));
    const edges: SimEdge[] = graph.edges
      .filter((e) => byRel.has(e.from) && byRel.has(e.to))
      .map((e) => ({ source: e.from, target: e.to }));

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
    // Run the layout synchronously — alpha decays, then the graph is static.
    for (let i = 0; i < 320; i += 1) sim.tick();
    sim.stop();

    simRef.current = { nodes, edges };
    viewRef.current = { x: 0, y: 0, k: 1 };
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const cssVar = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const ink = cssVar("--ink", "#141413");
    const line = cssVar("--line", "#e5e3d8");
    const muted = cssVar("--muted", "#6b6a64");
    const faint = cssVar("--faint", "#b8b6ad");
    const hover = hoverRef.current;
    const neighbors = new Set<string>();
    if (hover) {
      for (const edge of sim.edges) {
        if (edge.source === hover) neighbors.add(edge.target);
        if (edge.target === hover) neighbors.add(edge.source);
      }
    }
    const byRel = new Map(sim.nodes.map((n) => [n.rel, n]));
    const visible = (n: SimNode) => !n.hidden;
    const { x: vx, y: vy, k } = viewRef.current;

    ctx.lineWidth = 1;
    for (const edge of sim.edges) {
      const a = byRel.get(edge.source);
      const b = byRel.get(edge.target);
      if (!a || !b || !visible(a) || !visible(b)) continue;
      const highlighted =
        hover !== null && (edge.source === hover || edge.target === hover);
      ctx.strokeStyle = highlighted ? muted : line;
      ctx.beginPath();
      ctx.moveTo(a.x * k + vx, a.y * k + vy);
      ctx.lineTo(b.x * k + vx, b.y * k + vy);
      ctx.stroke();
    }

    ctx.font = "11px Inter, system-ui, sans-serif";
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
          : node.isolated || node.hidden
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
  }, [showIsolated]);

  useEffect(() => {
    draw();
  }, [hovered, showIsolated, showAll, draw]);

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
      if (node.hidden) continue;
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
    if (dragRef.current) {
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      dragRef.current = { x: event.clientX, y: event.clientY };
      viewRef.current.x += dx;
      viewRef.current.y += dy;
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

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const { k } = viewRef.current;
    const next = Math.min(4, Math.max(0.2, k * (event.deltaY < 0 ? 1.12 : 0.9)));
    viewRef.current.k = next;
    draw();
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
                const node = nodeAt(event.clientX, event.clientY);
                if (node) {
                  openNote(node.rel);
                  return;
                }
                dragRef.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={() => (dragRef.current = null)}
              onPointerLeave={() => {
                dragRef.current = null;
                hoverRef.current = null;
                setHovered(null);
              }}
              onWheel={onWheel}
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

