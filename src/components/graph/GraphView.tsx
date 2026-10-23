import {
  type Simulation,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import {
  IconSearch,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ipc } from "@/lib/ipc";
import { vaultNote } from "@/lib/noteRef";
import type { LinkGraph } from "@/lib/types";
import { cx } from "@/lib/utils";
import { FadeLoop, fitView, nodeAtPoint, prepareCanvas, readPalette } from "./graphCanvas";
import { folderSlots, forceGroup, groupOf, readGroupsPref, writeGroupsPref } from "./graphGroups";
import { mergeLinks, paintGraph, type SimEdge, type SimNode } from "./graphPaint";
import { searchNodes } from "./graphSearch";
import { useT } from "@/stores/locale";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/** Pointer travel (px) under which a press on a node counts as a click. */
const CLICK_SLOP = 4;
/** Layout work per animation frame, so large vaults never freeze the window. */
const FRAME_BUDGET_MS = 10;
/** Simulation heat while a node is held: neighbors keep following it. */
const DRAG_ALPHA = 0.3;
/** After the first layout, ticks are paced per frame so drags and the
 *  release read as motion (~2s to rest) instead of snapping in one frame. */
const INTERACTIVE_TICKS_PER_FRAME = 2;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
/** Auto-fit never magnifies a small graph past this. */
/** Room for the floating control bar and the counts line. */
const FIT = { padding: 64, minZoom: MIN_ZOOM, maxZoom: 1.5 };
/** Camera flight to a search hit; within the app's motion budget. */
const FLY_MS = 160;
/** A hit is framed at least this close. */
const FLY_ZOOM = 1.2;



/**
 * The vault's link graph as a tab pane, laid out by d3-force and drawn on a
 * plain canvas. Like note panes it stays mounted while other tabs are shown;
 * each visit re-queries the vault, but only a changed graph is laid out again.
 * The simulation runs in time-sliced batches across animation frames, so the
 * graph settles into place instead of blocking; once it has settled only
 * hover/pan/zoom redraw. Dragging a node pins it under the pointer and
 * reheats the simulation; on release it is unpinned and the graph relaxes.
 * The view keeps fitting the layout until the user pans or zooms. Isolated notes are hidden by default — they drown the
 * interesting structure in dots.
 */
export function GraphView({ active }: { active: boolean }) {
  const [graph, setGraph] = useState<LinkGraph | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showIsolated, setShowIsolated] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [groups, setGroups] = useState(readGroupsPref);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** Position in `matches` of the hit the camera last flew to (-1: none). */
  const [matchIndex, setMatchIndex] = useState(-1);
  /** Bumped when a new layout lands, so search sees the new node set. */
  const [layoutVersion, setLayoutVersion] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<{ nodes: SimNode[]; edges: SimEdge[] } | null>(null);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const hoverRef = useRef<string | null>(null);
  /** A press in progress: last pointer position for panning, press origin
   *  for click detection, and the node (if any) it started on — with the
   *  grab offset, so the node doesn't jump to center under the pointer. */
  const dragRef = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
    node: SimNode | null;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [draggingNode, setDraggingNode] = useState(false);
  const simulationRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const runFrameRef = useRef(0);
  /** False until the first layout has come to rest. */
  const settledRef = useRef(false);
  const matchesRef = useRef<ReadonlySet<string> | null>(null);
  /** The search hit in focus; stands in for hover when the mouse is idle. */
  const selectedRef = useRef<string | null>(null);
  const flyFrameRef = useRef(0);
  const autoFitRef = useRef(true);
  const showIsolatedRef = useRef(showIsolated);
  showIsolatedRef.current = showIsolated;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  // The note read last gets the "you are here" ring.
  const focus = useVault((s) => s.recentNotes[0] ?? null);
  const vaultVersion = useVault((s) => s.vaultVersion);
  const graphKeyRef = useRef("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const t = useT();

  // Query on every visit and vault refresh (links may have changed in a
  // note), but hand a new object to the layout only when the graph differs,
  // so revisiting doesn't reshuffle the dots.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    ipc
      .linkGraph()
      .then((g) => {
        if (cancelled) return;
        setLoadError(false);
        const key = graphSignature(g);
        if (key !== graphKeyRef.current) {
          graphKeyRef.current = key;
          setGraph(g);
        }
      })
      .catch(() => {
        if (!cancelled && graphKeyRef.current === "") setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, vaultVersion]);

  // Arriving on the tab puts the cursor in search, as the dialog did.
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [active]);

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
    // From every note in the vault, so toggles that change what's laid out
    // never shift which folder owns which color.
    const slots = folderSlots(graph.nodes.map((node) => node.rel));
    const nodes: SimNode[] = simmed.map((node, index) => {
      const d = degree.get(node.rel) ?? 0;
      const angle = (index / simmed.length) * Math.PI * 2;
      const group = groupOf(node.rel);
      return {
        rel: node.rel,
        title: node.title,
        x: width / 2 + Math.cos(angle) * Math.min(width, height) * 0.35,
        y: height / 2 + Math.sin(angle) * Math.min(width, height) * 0.35,
        // sqrt keeps hubs distinct without leaf notes all hitting the cap.
        r: Math.min(3.5 + Math.sqrt(d) * 2.2, 14),
        degree: d,
        isolated: d === 0,
        group,
        hue: groups && group !== null ? (slots.get(group) ?? null) : null,
      };
    });
    const byRel = new Map(nodes.map((n) => [n.rel, n]));
    const edges = mergeLinks(graph.edges.filter((e) => byRel.has(e.from) && byRel.has(e.to)));

    const sim = forceSimulation(nodes)
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
      .force("group", groups ? (forceGroup() as never) : null)
      .stop();

    simRef.current = { nodes, edges };
    simulationRef.current = sim;
    settledRef.current = false;
    setLayoutVersion((v) => v + 1);
    viewRef.current = { x: 0, y: 0, k: 1 };
    autoFitRef.current = true;
    runSim();
    return () => {
      cancelAnimationFrame(runFrameRef.current);
      runFrameRef.current = 0;
      simulationRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, showAll, layoutIsolates, groups]);

  const visibleNode = (node: SimNode) => showIsolatedRef.current || !node.isolated;

  /** Frame every visible node, centered, without magnifying tiny graphs. */
  const fitToLayout = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const view = fitView(sim.nodes, canvas.clientWidth, canvas.clientHeight, visibleNode, FIT);
    if (view) viewRef.current = view;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paints read refs only, so one loop serves the dialog's whole lifetime
  // and toggles mid-layout show up on the next frame.
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
          hover: hoverRef.current ?? selectedRef.current,
          focus: focusRef.current,
          matches: matchesRef.current,
          showIsolated: showIsolatedRef.current,
          groups: groupsRef.current,
          palette: readPalette(),
          dt,
        });
      }),
    [],
  );
  const draw = loop.draw;

  /** Tick in frame-sized slices until alpha decays, painting each frame; the
   *  view tracks the layout until the user takes over. Safe to call while
   *  already running — a drag reheat just extends the run. */
  const runSim = useCallback(() => {
    if (runFrameRef.current !== 0) return;
    const step = () => {
      runFrameRef.current = 0;
      const sim = simulationRef.current;
      if (!sim) return;
      const start = performance.now();
      const limit = settledRef.current ? INTERACTIVE_TICKS_PER_FRAME : Infinity;
      for (
        let ticks = 0;
        ticks < limit &&
        sim.alpha() > sim.alphaMin() &&
        performance.now() - start < FRAME_BUDGET_MS;
        ticks += 1
      ) {
        sim.tick();
      }
      if (autoFitRef.current) fitToLayout();
      draw();
      if (sim.alpha() > sim.alphaMin()) runFrameRef.current = requestAnimationFrame(step);
      else settledRef.current = true;
    };
    step();
  }, [draw, fitToLayout]);

  /** Let go of a dragged node: unpin it and let the graph cool down. */
  const releaseNode = () => {
    const drag = dragRef.current;
    const sim = simulationRef.current;
    if (!drag?.node || !drag.moved || !sim) return;
    drag.node.fx = null;
    drag.node.fy = null;
    sim.alphaTarget(0);
    runSim();
  };

  useEffect(() => () => loop.cancel(), [loop]);
  useEffect(() => {
    if (!active) loop.cancel();
  }, [active, loop]);

  useEffect(() => {
    if (autoFitRef.current) fitToLayout();
    draw();
  }, [hovered, showIsolated, showAll, draw, fitToLayout]);

  // Canvas size follows the dialog; without this a window resize leaves a
  // stretched, blurry bitmap until the next hover.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      if (autoFitRef.current) fitToLayout();
      draw();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [graph, draw, fitToLayout]);

  // Native listener: React's onWheel is passive, so it can't preventDefault.
  // Trackpad conventions: two-finger scroll pans, pinch (ctrlKey) or
  // ⌘-scroll zooms around the cursor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      autoFitRef.current = false;
      cancelAnimationFrame(flyFrameRef.current);
      flyFrameRef.current = 0;
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

  const matches = useMemo(() => {
    const nodes = simRef.current?.nodes.filter(visibleNode) ?? [];
    return searchNodes(nodes, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, layoutVersion, showIsolated]);

  useEffect(() => {
    matchesRef.current = query.trim() ? new Set(matches) : null;
    selectedRef.current = null;
    setMatchIndex(-1);
    draw();
  }, [matches, query, draw]);

  const cancelFly = () => {
    cancelAnimationFrame(flyFrameRef.current);
    flyFrameRef.current = 0;
  };

  /** Ease the camera to center `node`, zooming in to at least FLY_ZOOM. */
  const flyTo = (node: SimNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cancelFly();
    autoFitRef.current = false;
    const from = { ...viewRef.current };
    const k = Math.min(MAX_ZOOM, Math.max(from.k, FLY_ZOOM));
    const to = {
      k,
      x: canvas.clientWidth / 2 - node.x * k,
      y: canvas.clientHeight / 2 - node.y * k,
    };
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / FLY_MS);
      const e = 1 - (1 - t) ** 3;
      viewRef.current = {
        k: from.k + (to.k - from.k) * e,
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
      };
      draw();
      flyFrameRef.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    step();
  };

  /** Step through hits (wrapping) and fly to the new one. */
  const stepMatch = (delta: 1 | -1) => {
    if (matches.length === 0) return;
    const next =
      matchIndex < 0
        ? delta === 1
          ? 0
          : matches.length - 1
        : (matchIndex + delta + matches.length) % matches.length;
    const node = simRef.current?.nodes.find((n) => n.rel === matches[next]);
    setMatchIndex(next);
    if (!node) return;
    selectedRef.current = node.rel;
    flyTo(node);
  };

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        const rel = matchIndex >= 0 ? matches[matchIndex] : matches[0];
        if (rel) openNote(rel);
        return;
      }
      stepMatch(event.shiftKey ? -1 : 1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      stepMatch(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  };

  const nodeAt = (clientX: number, clientY: number): SimNode | null => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return null;
    const rect = canvas.getBoundingClientRect();
    return nodeAtPoint(
      sim.nodes,
      viewRef.current,
      clientX - rect.left,
      clientY - rect.top,
      visibleNode,
    );
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
      const first = !drag.moved;
      drag.moved = true;
      autoFitRef.current = false;
      cancelFly();
      const sim = simulationRef.current;
      const canvas = canvasRef.current;
      if (drag.node && sim && canvas) {
        const rect = canvas.getBoundingClientRect();
        const { x: vx, y: vy, k } = viewRef.current;
        const x = (event.clientX - rect.left - vx) / k + drag.offsetX;
        const y = (event.clientY - rect.top - vy) / k + drag.offsetY;
        // Move the dot now rather than on the next tick, so it never lags.
        drag.node.fx = drag.node.x = x;
        drag.node.fy = drag.node.y = y;
        if (first) {
          setDraggingNode(true);
          // Grabbing mid-layout switches to paced ticks too.
          settledRef.current = true;
          sim.alphaTarget(DRAG_ALPHA);
          if (sim.alpha() < DRAG_ALPHA) sim.alpha(DRAG_ALPHA);
        }
        runSim();
        return;
      }
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
    const vault = useVault.getState();
    const note = vaultNote(rel);
    vault.expandTo(rel);
    vault.setView({ type: "note", note });
    useTabs.getState().requestScrollTop(note);
  };

  /** Linked pairs, so a mutual link counts once — as it's drawn. */
  const linkCount = useMemo(() => (graph ? mergeLinks(graph.edges).length : 0), [graph]);

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
    <section aria-label={t("graph.aria")} className="relative h-full bg-bg">
        <div className="absolute inset-0">
          {loadError ? (
            <p className="grid h-full place-items-center text-[13px] text-faint">
              {t("graph.loadFailed")}
            </p>
          ) : graph === null ? null : (
            <canvas
              ref={canvasRef}
              className={cx(
                "h-full w-full",
                draggingNode
                  ? "cursor-grabbing"
                  : hovered
                    ? "cursor-pointer"
                    : "cursor-grab active:cursor-grabbing",
              )}
              onPointerMove={onPointerMove}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                // Capture so a pan that leaves the canvas still ends cleanly.
                event.currentTarget.setPointerCapture(event.pointerId);
                const node = nodeAt(event.clientX, event.clientY);
                let offsetX = 0;
                let offsetY = 0;
                if (node) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const { x: vx, y: vy, k } = viewRef.current;
                  offsetX = node.x - (event.clientX - rect.left - vx) / k;
                  offsetY = node.y - (event.clientY - rect.top - vy) / k;
                }
                dragRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  startX: event.clientX,
                  startY: event.clientY,
                  moved: false,
                  node,
                  offsetX,
                  offsetY,
                };
              }}
              onPointerUp={() => {
                const drag = dragRef.current;
                releaseNode();
                dragRef.current = null;
                setDraggingNode(false);
                // A press that never moved is a click on its node.
                if (drag && !drag.moved && drag.node) openNote(drag.node.rel);
              }}
              onPointerCancel={() => {
                releaseNode();
                dragRef.current = null;
                setDraggingNode(false);
              }}
              onPointerLeave={() => {
                if (dragRef.current) return;
                hoverRef.current = null;
                setHovered(null);
              }}
            />
          )}
          {/* One floating bar over the canvas instead of a header strip:
              search, then the view toggles, no dividing line to the graph. */}
          {graph && (
            <div className="absolute left-3 top-3 flex max-w-[calc(100%-24px)] items-center gap-1 rounded-[10px] border border-line-soft bg-panel/85 p-1 shadow-sm backdrop-blur-md">
              <label className="flex w-60 min-w-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-100 focus-within:bg-bg">
                <IconSearch size={12} stroke={2} className="shrink-0 text-faint" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onSearchKey}
                  placeholder={t("graph.search")}
                  aria-label={t("graph.search")}
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint"
                />
                {query.trim() && (
                  <span className="shrink-0 text-[11px] tabular-nums text-faint">
                    {matches.length === 0
                      ? t("graph.noMatches")
                      : matchIndex >= 0
                        ? `${matchIndex + 1} / ${matches.length}`
                        : matches.length}
                  </span>
                )}
              </label>
              {graph.nodes.length > 0 && (
                <>
                  <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-line" />
                  <Toggle
                    on={groups}
                    onClick={() => {
                      writeGroupsPref(!groups);
                      setGroups(!groups);
                    }}
                  >
                    {t("graph.groupFolders")}
                  </Toggle>
                  {isolatedCount > 0 && (
                    <Toggle on={showIsolated} onClick={() => setShowIsolated((v) => !v)}>
                      {t("graph.showIsolated")}
                    </Toggle>
                  )}
                  {graph.nodes.length > 2000 && (
                    <Toggle on={showAll} onClick={() => setShowAll((v) => !v)}>
                      {t("graph.showAll")}
                    </Toggle>
                  )}
                </>
              )}
            </div>
          )}
          {graph && (
            <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] tabular-nums text-faint">
              {t("graph.counts", { notes: graph.nodes.length, links: linkCount })}
            </p>
          )}
        </div>
    </section>
  );
}

/** Identity of a graph's content, to skip relayouts when nothing changed. */
function graphSignature(graph: LinkGraph): string {
  const nodes = graph.nodes.map((n) => n.rel).join("\n");
  const edges = graph.edges.map((e) => `${e.from}>${e.to}`).join("\n");
  return `${nodes}\n--\n${edges}`;
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "h-7 shrink-0 whitespace-nowrap rounded-md px-2.5 text-[11.5px] transition-colors duration-100",
        on ? "bg-active text-ink" : "text-faint hover:bg-hover hover:text-muted",
      )}
    >
      {children}
    </button>
  );
}
