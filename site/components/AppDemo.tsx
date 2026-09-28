"use client";

import {
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  PanelLeft,
  Search,
  Settings,
  Share2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GraphScene, type GraphPhase } from "@/components/GraphDemo";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

/* The hero workbench: the app as it looks today, playing a short tour —
   write (a [[link]] resolves as you type), connect (the graph opens as a
   tab), find (⌘K). It only plays while on screen; reduced motion gets the
   finished writing frame. */

const SCENES = [
  { id: "write", label: "Write", ms: 4600 },
  { id: "connect", label: "Connect", ms: 4400 },
  { id: "find", label: "Find", ms: 3800 },
] as const;
type Scene = (typeof SCENES)[number]["id"];

const TYPED = "Next, polish the editor pass and ship it — see ";
const LINK = "Release notes";
const TYPED_FULL = `${TYPED}[[${LINK}]]`;

/* ── Sidebar ─────────────────────────────────────────────────────────── */

type TreeNode = { label: string; depth: number; kind: "folder" | "file"; open?: boolean };
const TREE: TreeNode[] = [
  { label: "Projects", depth: 0, kind: "folder", open: true },
  { label: "Q3 Roadmap", depth: 1, kind: "file" },
  { label: "Release notes", depth: 1, kind: "file" },
  { label: "Research", depth: 0, kind: "folder" },
  { label: "Journal", depth: 0, kind: "folder" },
  { label: "Reading list", depth: 0, kind: "file" },
];

function Sidebar({ active }: { active: string | null }) {
  return (
    <aside className="hidden w-[210px] shrink-0 flex-col border-r border-line-soft bg-panel sm:flex">
      {/* Traffic lights live in the chrome, as in the app — no title bar. */}
      <div className="flex h-11 items-center gap-2 px-4">
        <span className="size-3 rounded-full bg-foreground/20" />
        <span className="size-3 rounded-full bg-foreground/12" />
        <span className="size-3 rounded-full bg-foreground/[0.08]" />
      </div>
      <div className="flex items-center justify-between pb-1 pl-4 pr-2 pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Notes</span>
        <span className="flex items-center gap-0.5 text-faint">
          <FilePlus size={14} strokeWidth={1.75} />
          <FolderPlus size={14} strokeWidth={1.75} />
        </span>
      </div>
      <div className="flex-1 px-2 pt-1">
        {TREE.map((node) => {
          const Icon = node.kind === "folder" ? (node.open ? FolderOpen : Folder) : FileText;
          const selected = node.label === active;
          return (
            <div
              key={node.label}
              className={cn(
                "relative flex h-[30px] items-center rounded-md pr-1.5 text-[13px]",
                selected ? "text-primary-foreground" : "text-muted-foreground",
              )}
              style={{ paddingLeft: 8 + node.depth * 15 }}
            >
              {selected && (
                <motion.span
                  layoutId="hero-tree-selection"
                  transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                  className="absolute inset-0 rounded-md bg-foreground"
                />
              )}
              <Icon
                size={14}
                strokeWidth={1.75}
                className={cn("relative mr-2 shrink-0", selected ? "text-primary-foreground" : "text-faint")}
              />
              <span className={cn("relative truncate", node.kind === "folder" && "font-medium")}>
                {node.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center border-t border-line-soft px-3 py-2 text-faint">
        <Settings size={15} strokeWidth={1.75} />
      </div>
    </aside>
  );
}

/* ── Tab strip ───────────────────────────────────────────────────────── */

function Tab({ label, active, graph }: { label: string; active: boolean; graph?: boolean }) {
  return (
    <motion.div
      layout
      initial={graph ? { opacity: 0, width: 0 } : false}
      animate={{ opacity: 1, width: "auto" }}
      exit={{ opacity: 0, width: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      className={cn(
        "relative flex h-full min-w-0 max-w-[170px] shrink-0 items-center gap-1.5 overflow-hidden pl-3 pr-1.5 text-[12.5px]",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="hero-tab-fill"
          transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          className="absolute inset-0 bg-background"
        />
      )}
      {graph && <Share2 size={12} strokeWidth={2} className="relative shrink-0 text-faint" />}
      <span className="relative truncate whitespace-nowrap">{label}</span>
      <span className={cn("relative grid size-5 shrink-0 place-items-center", active ? "opacity-60" : "opacity-0")}>
        <X size={11} strokeWidth={2} />
      </span>
    </motion.div>
  );
}

function TabStrip({ scene }: { scene: Scene }) {
  return (
    <div className="flex h-11 shrink-0 items-stretch gap-1.5 bg-panel pl-2.5 pr-3">
      <div className="flex shrink-0 items-center">
        <span className="grid size-7 place-items-center rounded-md text-faint">
          <PanelLeft size={15.5} strokeWidth={1.75} />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <Tab label="Q3 Roadmap" active={scene !== "connect"} />
        <Tab label="Release notes" active={false} />
        <AnimatePresence initial={false}>
          {scene === "connect" && <Tab key="graph" label="Link graph" active graph />}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Note ────────────────────────────────────────────────────────────── */

function NotePane({ typed, still }: { typed: number; still: boolean }) {
  const done = typed >= TYPED_FULL.length;
  const text = TYPED_FULL.slice(0, typed);
  return (
    <div className="h-full bg-background">
      <div className="flex h-10 items-center px-3 text-[13.5px]">
        <span className="text-muted-foreground">Projects</span>
        <ChevronRight size={13} strokeWidth={2} className="mx-1.5 text-faint" />
        <span className="font-semibold text-foreground">Q3 Roadmap</span>
      </div>
      <div className="mx-auto max-w-[600px] px-8 pt-5 font-note sm:px-10">
        {/* UI mock, not document structure — no real headings here. */}
        <div role="presentation" className="text-[30px] font-[680] leading-tight tracking-[-0.025em] text-foreground">
          Q3 Roadmap
        </div>
        <div className="mt-4 space-y-4 text-[15.5px] leading-[1.7] text-foreground/85">
          <p>
            The quarter is about speed and focus — make writing feel instant, then let
            AssistantPi help only when it is invited.
          </p>
          <div role="presentation" className="pt-1 text-[20px] font-[580] tracking-[-0.012em] text-foreground">
            Milestones
          </div>
          <ul className="space-y-2">
            {["Instant note switching", "A link graph for the whole vault", "PDF export with bookmarks"].map(
              (item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="grid size-[18px] shrink-0 place-items-center rounded border border-foreground bg-foreground text-background">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-muted-foreground line-through decoration-faint">{item}</span>
                </li>
              ),
            )}
          </ul>
          <p className="min-h-[1.7em]">
            {done ? (
              <>
                {TYPED}
                <motion.span
                  initial={still ? false : { backgroundColor: "rgba(22,23,20,0.12)" }}
                  animate={{ backgroundColor: "rgba(22,23,20,0)" }}
                  transition={{ duration: 0.9, ease: EASE_OUT }}
                  className="rounded-[3px] text-foreground underline decoration-border-strong underline-offset-[3px]"
                >
                  {LINK}
                </motion.span>
                .
              </>
            ) : (
              text
            )}
            {!still && (
              <motion.span
                aria-hidden
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-foreground align-middle"
              />
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Graph tab ───────────────────────────────────────────────────────── */

function GraphPane({ phase }: { phase: GraphPhase }) {
  return (
    <div className="relative grid h-full place-items-center bg-card px-4">
      <div className="w-full max-w-[640px]">
        <GraphScene phase={phase} />
      </div>
      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-[9px] border border-border bg-paper/85 p-1 shadow-sm backdrop-blur-md">
        <span className="flex w-40 items-center gap-1.5 px-2 py-1 text-[11.5px] text-faint">
          <Search size={11} />
          Find a note
        </span>
        <span aria-hidden className="h-3.5 w-px bg-border" />
        <span className="rounded-md bg-active px-2 py-1 text-[11px] text-foreground">Group by folder</span>
      </div>
      <p className="absolute bottom-3 left-4 font-mono text-[9.5px] text-faint">13 notes · 14 links</p>
    </div>
  );
}

/* ── ⌘K ──────────────────────────────────────────────────────────────── */

const RESULTS = [
  ["Release notes", "projects/release-notes.md"],
  ["Reading list", "reading-list.md"],
] as const;

function Palette({ query }: { query: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      className="absolute inset-0 bg-foreground/[0.04] backdrop-blur-[1.5px]"
    >
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="surface mx-auto mt-14 w-[min(400px,88%)] overflow-hidden rounded-xl bg-paper p-2"
      >
        <div className="flex h-10 items-center gap-2.5 border-b border-border px-3">
          <Search size={14} className="text-faint" />
          <span className="text-[13px] text-foreground">{query}</span>
          <motion.span
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="-ml-2 h-4 w-px bg-foreground"
          />
          <kbd className="ml-auto font-mono text-[9px] text-faint">⌘K</kbd>
        </div>
        <div className="pt-1.5">
          {RESULTS.filter(([title]) => title.toLowerCase().includes(query.toLowerCase())).map(
            ([title, path], index) => (
              <div
                key={title}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3",
                  index === 0 && "bg-foreground text-primary-foreground",
                )}
              >
                <FileText size={14} className={index === 0 ? "text-primary-foreground" : "text-faint"} />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px]">{title}</span>
                  <span className={cn("block truncate font-mono text-[9px]", index === 0 ? "text-primary-foreground/55" : "text-faint")}>
                    {path}
                  </span>
                </span>
              </div>
            ),
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Window + chapter rail ───────────────────────────────────────────── */

export function AppDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const reduce = Boolean(useReducedMotion());
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  /** Bumped by a rail click, so re-clicking the current chapter restarts it. */
  const [run, setRun] = useState(0);
  const playing = inView && !reduce;
  const scene = SCENES[index];

  // One clock drives the tour: elapsed time within the current scene.
  useEffect(() => {
    if (!playing) return;
    const started = performance.now() - elapsed;
    const timer = window.setInterval(() => {
      const t = performance.now() - started;
      if (t >= scene.ms) {
        setIndex((i) => (i + 1) % SCENES.length);
        setElapsed(0);
      } else {
        setElapsed(t);
      }
    }, 50);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, run]);

  const jump = (next: number) => {
    setIndex(next);
    setElapsed(0);
    setRun((r) => r + 1);
  };

  // Scene-local timelines.
  const typed = reduce
    ? TYPED_FULL.length
    : scene.id === "write"
      ? Math.min(TYPED_FULL.length, Math.max(0, Math.floor((elapsed - 500) / 45)))
      : TYPED_FULL.length;
  const graphPhase: GraphPhase = scene.id === "connect" && elapsed > 1500 ? "hover" : "rest";
  const query = "Release".slice(0, Math.max(0, Math.floor((elapsed - 500) / 110)));

  return (
    <div ref={ref}>
      <div className="overflow-hidden rounded-xl border border-border-strong bg-background shadow-workbench">
        <div className="flex h-[480px] sm:aspect-[16/10] sm:h-auto">
          <Sidebar active={scene.id === "connect" ? null : "Q3 Roadmap"} />
          <main className="flex min-w-0 flex-1 flex-col">
            <TabStrip scene={scene.id} />
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {scene.id === "connect" ? (
                <GraphPane phase={graphPhase} />
              ) : (
                <NotePane typed={typed} still={reduce} />
              )}
              <AnimatePresence>
                {scene.id === "find" && <Palette key="palette" query={query} />}
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>

      {/* Chapter rail: where the tour is, and a way to jump. */}
      <div className="mx-auto mt-6 grid max-w-[520px] grid-cols-3 gap-4">
        {SCENES.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => jump(i)}
            aria-pressed={i === index}
            className="group text-left"
          >
            <span className="relative block h-px overflow-hidden bg-border">
              <motion.span
                className="absolute inset-y-0 left-0 bg-foreground"
                initial={false}
                animate={{ width: i < index ? "100%" : i === index ? `${(elapsed / item.ms) * 100}%` : "0%" }}
                transition={{ duration: 0.05, ease: "linear" }}
              />
            </span>
            <span
              className={cn(
                "mt-2.5 flex items-baseline gap-2 font-mono text-[9.5px] uppercase tracking-[0.14em] transition-colors duration-150",
                i === index ? "text-foreground" : "text-faint group-hover:text-muted-foreground",
              )}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
