"use client";

import { Search } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

/* A pre-laid-out slice of a vault, drawn the way the app draws it: folder
   regions tinted with the graph palette, degree-sized dots, mutual links a
   touch heavier, arrowheads only while a note is in focus. */

type Folder = "projects" | "research" | "journal" | null;

const NODES: { id: string; x: number; y: number; folder: Folder }[] = [
  { id: "Roadmap", x: 272, y: 168, folder: "projects" },
  { id: "Principles", x: 196, y: 112, folder: "projects" },
  { id: "Release notes", x: 316, y: 88, folder: "projects" },
  { id: "Architecture", x: 352, y: 206, folder: "projects" },
  { id: "Launch plan", x: 236, y: 238, folder: "projects" },
  { id: "Interviews", x: 458, y: 118, folder: "research" },
  { id: "Competitors", x: 506, y: 190, folder: "research" },
  { id: "Insights", x: 440, y: 256, folder: "research" },
  { id: "Weekly review", x: 88, y: 150, folder: "journal" },
  { id: "Monday", x: 112, y: 228, folder: "journal" },
  { id: "Ideas", x: 162, y: 290, folder: "journal" },
  { id: "Inbox", x: 404, y: 40, folder: null },
  { id: "Reading list", x: 52, y: 300, folder: null },
];

// [from, to, mutual]
const LINKS: [string, string, boolean][] = [
  ["Roadmap", "Principles", true],
  ["Roadmap", "Release notes", false],
  ["Roadmap", "Architecture", true],
  ["Launch plan", "Roadmap", false],
  ["Roadmap", "Insights", false],
  ["Interviews", "Insights", true],
  ["Competitors", "Insights", false],
  ["Weekly review", "Roadmap", false],
  ["Monday", "Weekly review", true],
  ["Ideas", "Monday", false],
  ["Ideas", "Launch plan", false],
  ["Inbox", "Release notes", false],
  ["Principles", "Architecture", false],
  ["Reading list", "Ideas", false],
];

const FOLDER_COLOR: Record<Exclude<Folder, null>, string> = {
  projects: "var(--graph-1)",
  research: "var(--graph-2)",
  journal: "var(--graph-3)",
};

const W = 560;
const H = 340;
/** Headroom above the graph for the floating toolbar, and below it for
 *  the counts line (which doesn't shrink with the drawing on phones). */
const TOP = 44;
const BOTTOM = 26;
const HOVER = "Roadmap";
const QUERY = "insi";
const MATCH = "Insights";

const degree = new Map<string, number>();
for (const [a, b] of LINKS) {
  degree.set(a, (degree.get(a) ?? 0) + 1);
  degree.set(b, (degree.get(b) ?? 0) + 1);
}
const byId = new Map(NODES.map((n) => [n.id, n]));
const radius = (id: string) => Math.min(4 + Math.sqrt(degree.get(id) ?? 0) * 2.4, 12);
const neighbors = (id: string) =>
  new Set(LINKS.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : [])));

/** Monotone-chain hull, enough for a handful of dots per folder. */
function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const out: [number, number][] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

const REGIONS = (Object.keys(FOLDER_COLOR) as Exclude<Folder, null>[]).map((folder) => {
  const members = NODES.filter((n) => n.folder === folder);
  const margin = Math.max(...members.map((n) => radius(n.id))) + 11;
  const pts = hull(members.map((n) => [n.x, n.y]));
  return {
    folder,
    margin,
    points: pts.map((q) => q.join(",")).join(" "),
    labelX: (Math.min(...pts.map((q) => q[0])) + Math.max(...pts.map((q) => q[0]))) / 2,
    labelY: Math.min(...pts.map((q) => q[1])) - margin - 6,
  };
});

/** Arrowhead touching the target's rim, pointing along from → to. */
function arrow(from: string, to: string) {
  const a = byId.get(from)!;
  const b = byId.get(to)!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const tipX = b.x - ux * (radius(to) + 2);
  const tipY = b.y - uy * (radius(to) + 2);
  const baseX = tipX - ux * 7;
  const baseY = tipY - uy * 7;
  return `${tipX},${tipY} ${baseX - uy * 3.5},${baseY + ux * 3.5} ${baseX + uy * 3.5},${baseY - ux * 3.5}`;
}

// rest → a hub in focus → search flies to a hit
const PHASES = ["rest", "hover", "search"] as const;
export type GraphPhase = (typeof PHASES)[number];
type Phase = GraphPhase;

/** The camera is the viewBox: the full map, or zoomed onto the search hit
 *  (centered in the space below the toolbar). */
const FULL_VIEW = `0 ${-TOP} ${W} ${H + TOP + BOTTOM}`;
const ZOOM = 1.6;
const zoomedView = (() => {
  const w = W / ZOOM;
  const h = (H + TOP + BOTTOM) / ZOOM;
  const hit = byId.get(MATCH)!;
  // Center the hit in the band between toolbar and counts line.
  const headroom = (TOP - BOTTOM) / ZOOM;
  return `${hit.x - w / 2} ${hit.y - (h + headroom) / 2} ${w} ${h}`;
})();
const CAMERA: Record<Phase, string> = { rest: FULL_VIEW, hover: FULL_VIEW, search: zoomedView };

function usePhase(enabled: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % PHASES.length), 2600);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return PHASES[index];
}

/** The graph drawing alone, driven by `phase` — shared by the feature demo
 *  and the hero tour. Fills its container's width. */
export function GraphScene({ phase }: { phase: GraphPhase }) {
  const focus = phase === "hover" ? HOVER : phase === "search" ? MATCH : null;
  const near = focus ? neighbors(focus) : new Set<string>();
  const lit = (id: string) => !focus || id === focus || (phase === "hover" && near.has(id));
  const fade = { duration: 0.18, ease: EASE_OUT };

  return (
    <motion.svg
      viewBox={FULL_VIEW}
      initial={false}
      animate={{ viewBox: CAMERA[phase] }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="block h-auto w-full"
      role="img"
      aria-label="A graph of linked notes grouped into folder regions"
    >
      <g>
        {REGIONS.map((region) => (
          <g key={region.folder}>
            <polygon
              points={region.points}
              fill={`color-mix(in srgb, ${FOLDER_COLOR[region.folder]} 14%, var(--card))`}
              stroke={`color-mix(in srgb, ${FOLDER_COLOR[region.folder]} 14%, var(--card))`}
              strokeWidth={region.margin * 2}
              strokeLinejoin="round"
            />
            <text
              x={region.labelX}
              y={region.labelY}
              textAnchor="middle"
              className="fill-faint font-mono text-[8px] uppercase tracking-[0.12em]"
            >
              {region.folder}
            </text>
          </g>
        ))}

        {LINKS.map(([from, to, mutual]) => {
          const a = byId.get(from)!;
          const b = byId.get(to)!;
          const touching = focus !== null && phase === "hover" && (from === focus || to === focus);
          return (
            <motion.line
              key={`${from}>${to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              initial={false}
              animate={{
                stroke: touching ? "var(--fg-muted)" : "var(--border-strong)",
                opacity: focus && !touching ? 0.35 : mutual ? 1 : 0.6,
              }}
              transition={fade}
              strokeWidth={mutual ? 1.4 : 1}
            />
          );
        })}

        <AnimatePresence>
          {phase === "hover" &&
            LINKS.filter(([from, to, mutual]) => !mutual && (from === HOVER || to === HOVER)).map(
              ([from, to]) => (
                <motion.polygon
                  key={`arrow-${from}>${to}`}
                  points={arrow(from, to)}
                  className="fill-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fade}
                />
              ),
            )}
        </AnimatePresence>

        {NODES.map((node) => {
          const isFocus = node.id === focus;
          const color = node.folder ? FOLDER_COLOR[node.folder] : "var(--fg-muted)";
          const showLabel =
            isFocus || (phase === "hover" && near.has(node.id)) || (!focus && (degree.get(node.id) ?? 0) >= 4);
          return (
            <g key={node.id}>
              <motion.circle
                cx={node.x}
                cy={node.y}
                r={radius(node.id)}
                initial={false}
                animate={{ fill: isFocus ? "var(--fg)" : color, opacity: lit(node.id) ? 1 : 0.28 }}
                transition={fade}
              />
              {isFocus && (
                <circle cx={node.x} cy={node.y} r={radius(node.id) + 4} fill="none" stroke="var(--fg)" strokeOpacity={0.45} />
              )}
              <motion.text
                x={node.x + radius(node.id) + (isFocus ? 8 : 5)}
                y={node.y + 3.5}
                initial={false}
                animate={{ opacity: showLabel ? 1 : 0 }}
                transition={fade}
                className={cn("text-[10.5px]", isFocus ? "fill-foreground" : "fill-muted-foreground")}
                style={{ paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 3, strokeLinejoin: "round" }}
              >
                {node.id}
              </motion.text>
            </g>
          );
        })}
      </g>
    </motion.svg>
  );
}

export function GraphDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  // Reduced motion holds the most explanatory frame instead of cycling.
  const cycled = usePhase(Boolean(inView && !reduce));
  const phase: Phase = reduce ? "hover" : cycled;


  return (
    <div ref={ref} className="surface overflow-hidden rounded-[18px] bg-paper p-2">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">Link graph</span>
        <span className="flex gap-1.5">
          <span className="size-1.5 rounded-full bg-foreground/18" />
          <span className="size-1.5 rounded-full bg-foreground/10" />
        </span>
      </div>

      <div className="relative overflow-hidden rounded-[10px] bg-card">
        <GraphScene phase={phase} />

        {/* The app's floating bar: search and view toggles over the canvas. */}
        <div className="absolute left-3 top-3 flex items-center gap-1 rounded-[9px] border border-border bg-paper/85 p-1 shadow-sm backdrop-blur-md">
          <span className="flex w-36 items-center gap-1.5 px-2 py-1 text-[11px] sm:w-44">
            <Search size={11} className="shrink-0 text-faint" />
            {phase === "search" ? (
              <>
                <span className="text-foreground">{QUERY}</span>
                <span className="ml-auto font-mono text-[9px] text-faint">1 / 1</span>
              </>
            ) : (
              <span className="text-faint">Find a note</span>
            )}
          </span>
          <span aria-hidden className="h-3.5 w-px bg-border" />
          <span className="rounded-md bg-active px-2 py-1 text-[10.5px] text-foreground">Group by folder</span>
        </div>
        <p className="pointer-events-none absolute bottom-2.5 left-4 font-mono text-[9px] tabular-nums text-faint">
          {NODES.length} notes · {LINKS.length} links
        </p>
      </div>
    </div>
  );
}
