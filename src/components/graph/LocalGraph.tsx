import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation } from "d3-force";
import { Maximize2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SectionHeader, openNoteAt } from "@/components/editor/NoteBacklinks";
import { EASE_OUT } from "@/lib/ease";
import { ipc } from "@/lib/ipc";
import type { LinkGraph } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";
import { FadeLoop, type View, fitView, nodeAtPoint, prepareCanvas, readPalette } from "./graphCanvas";
import { type SimEdge, type SimNode, mergeLinks, paintGraph } from "./graphPaint";
import { neighborhood } from "./neighborhood";

const OPEN_KEY = "ornata:local-graph-open";
const DEPTH_KEY = "ornata:local-graph-depth";
/** Ring spacing: each hop settles roughly this far out from the center. */
const RING = 84;
const FIT = { padding: 28, minZoom: 0.3, maxZoom: 1.3 };
const always = () => true;

function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the choice just won't stick.
  }
}

/**
 * The note's neighborhood as a small graph in the note footer: the note at
 * the center, linked notes (either direction) on the first ring, and
 * optionally their links on the second. Collapsed by default and only
 * scanned while open, like unlinked mentions; open state and depth persist.
 */
export function LocalGraph({ rel, active }: { rel: string; active: boolean }) {
  const t = useT();
  const tree = useVault((s) => s.tree);
  const [open, setOpen] = useState(() => readPref(OPEN_KEY, "0", ["0", "1"]) === "1");
  const [depth, setDepth] = useState<1 | 2>(() =>
    readPref(DEPTH_KEY, "1", ["1", "2"]) === "2" ? 2 : 1,
  );
  const [graph, setGraph] = useState<LinkGraph | null>(null);

  useEffect(() => {
    setGraph(null);
  }, [rel]);

  useEffect(() => {
    if (!open || !active) return;
    let cancelled = false;
    ipc
      .linkGraph()
      .then((next) => {
        if (!cancelled) setGraph(next);
      })
      .catch(() => {
        if (!cancelled) setGraph({ nodes: [], edges: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, active, rel, tree]);

  const hood = useMemo(
    () => (graph ? neighborhood(graph, rel, depth) : null),
    [graph, rel, depth],
  );
  const linked = hood ? [...hood.depth.values()].filter((d) => d === 1).length : 0;

  const toggle = () => {
    writePref(OPEN_KEY, open ? "0" : "1");
    setOpen(!open);
  };
  const pickDepth = (next: 1 | 2) => {
    writePref(DEPTH_KEY, String(next));
    setDepth(next);
  };

  return (
    <section>
      <div className="flex items-start justify-between">
        <SectionHeader open={open} onToggle={toggle}>
          {t("graph.local")}
          {hood && linked > 0 && <span className="ml-1 tabular-nums">{linked}</span>}
        </SectionHeader>
        {open && (
          <div className="flex items-center gap-1">
            {([1, 2] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => pickDepth(value)}
                aria-pressed={depth === value}
                aria-label={t("graph.depth", { count: value })}
                className={cx(
                  "h-5 min-w-5 rounded px-1 text-[11px] tabular-nums transition-colors duration-100",
                  depth === value ? "bg-invert text-invert-ink" : "text-faint hover:bg-hover hover:text-muted",
                )}
              >
                {value}
              </button>
            ))}
            <button
              type="button"
              onClick={() => useVault.getState().setView({ type: "graph" })}
              aria-label={t("graph.openFull")}
              title={t("graph.openFull")}
              className="ml-1 grid h-5 w-5 place-items-center rounded text-faint transition-colors duration-100 hover:bg-hover hover:text-muted"
            >
              <Maximize2 size={12} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            {hood && hood.depth.size <= 1 ? (
              <p className="px-2 py-1.5 text-[12px] text-faint">{t("graph.localEmpty")}</p>
            ) : (
              <>
                <LocalCanvas rel={rel} hood={hood} titles={graph} active={active} />
                {hood && hood.hidden > 0 && (
                  <p className="mt-1 px-1 text-[11px] text-faint">
                    {t("graph.localHidden", { count: hood.hidden })}
                  </p>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function LocalCanvas({
  rel,
  hood,
  titles,
  active,
}: {
  rel: string;
  hood: ReturnType<typeof neighborhood> | null;
  titles: LinkGraph | null;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<{ nodes: SimNode[]; edges: SimEdge[]; firstRing: Set<string> } | null>(
    null,
  );
  const viewRef = useRef<View>({ x: 0, y: 0, k: 1 });
  const hoverRef = useRef<string | null>(null);
  const [hovering, setHovering] = useState(false);

  const loop = useMemo(
    () =>
      new FadeLoop((dt) => {
        const canvas = canvasRef.current;
        const sim = simRef.current;
        if (!canvas || !sim) return false;
        const surface = prepareCanvas(canvas);
        if (!surface) return false;
        return paintGraph({
          ...surface,
          nodes: sim.nodes,
          edges: sim.edges,
          view: viewRef.current,
          hover: hoverRef.current,
          focus: rel,
          alwaysLabel: sim.firstRing,
          showIsolated: true,
          palette: readPalette(),
          dt,
        });
      }),
    [rel],
  );
  useEffect(() => () => loop.cancel(), [loop]);

  const refit = () => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const view = fitView(sim.nodes, canvas.clientWidth, canvas.clientHeight, always, FIT);
    if (view) viewRef.current = view;
  };

  // Relayout only when the neighborhood itself changed — a vault refresh
  // that leaves it intact must not reshuffle the dots.
  const signature = useMemo(() => {
    if (!hood) return "";
    const nodes = [...hood.depth.entries()].map(([r, d]) => `${d}:${r}`).sort();
    const edges = hood.edges.map((e) => `${e.from}>${e.to}`).sort();
    return `${rel}|${nodes.join(",")}|${edges.join(",")}`;
  }, [hood, rel]);

  useEffect(() => {
    if (!hood) return;
    const titleOf = new Map((titles?.nodes ?? []).map((n) => [n.rel, n.title]));
    const rings = new Map<number, string[]>();
    for (const [r, d] of hood.depth) rings.set(d, [...(rings.get(d) ?? []), r]);
    const nodes: SimNode[] = [];
    for (const [d, members] of rings) {
      members.sort();
      members.forEach((r, index) => {
        // Seed each ring evenly around the center; the forces refine it.
        const angle = (index / members.length) * Math.PI * 2 + d * 0.6;
        const degree = hood.degree.get(r) ?? 0;
        nodes.push({
          rel: r,
          title: titleOf.get(r) ?? r.replace(/\.md$/i, ""),
          x: Math.cos(angle) * d * RING,
          y: Math.sin(angle) * d * RING,
          r: Math.min(3.5 + Math.sqrt(degree) * 2.2, 14),
          degree,
          isolated: false,
        });
      });
    }
    const center = nodes.find((n) => n.rel === rel);
    if (center) Object.assign(center, { fx: 0, fy: 0 });
    const edges = mergeLinks(hood.edges);
    const depthOf = (node: unknown) => hood.depth.get((node as SimNode).rel) ?? 0;
    const sim = forceSimulation(nodes as never[])
      .force(
        "link",
        forceLink(edges as never[])
          .id((d: unknown) => (d as SimNode).rel)
          .distance(RING * 0.7)
          .strength(0.3),
      )
      .force("charge", forceManyBody().strength(-120))
      .force("collide", forceCollide().radius((d: unknown) => (d as SimNode).r + 6))
      // Hops settle into rings: the structure reads at a glance.
      .force("radial", forceRadial((d: unknown) => depthOf(d) * RING, 0, 0).strength(0.8))
      .stop();
    // A neighborhood is small (≤ ~100 notes); settle it in one pass.
    for (let i = 0; i < 300; i += 1) sim.tick();
    simRef.current = {
      nodes,
      edges,
      firstRing: new Set([...hood.depth].filter(([, d]) => d === 1).map(([r]) => r)),
    };
    refit();
    loop.draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loop]);

  // Hidden tab panes have no size; the observer fires when they reappear.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      refit();
      loop.draw();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop]);

  useEffect(() => {
    if (active) loop.draw();
  }, [active, loop]);

  const hitTest = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return null;
    const rect = canvas.getBoundingClientRect();
    return nodeAtPoint(
      sim.nodes,
      viewRef.current,
      event.clientX - rect.left,
      event.clientY - rect.top,
      always,
    );
  };

  const setHover = (next: string | null) => {
    if (next === hoverRef.current) return;
    hoverRef.current = next;
    setHovering(next !== null && next !== rel);
    loop.draw();
  };

  return (
    <canvas
      ref={canvasRef}
      className={cx(
        "mt-1 block h-[260px] w-full rounded-lg border border-line-soft",
        hovering && "cursor-pointer",
      )}
      onPointerMove={(event) => setHover(hitTest(event)?.rel ?? null)}
      onPointerLeave={() => setHover(null)}
      onClick={(event) => {
        const node = hitTest(event);
        if (node && node.rel !== rel) openNoteAt(node.rel, rel);
      }}
    />
  );
}
