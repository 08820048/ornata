"use client";

import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code2,
  Columns2,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  History,
  ListChecks,
  MoreHorizontal,
  Palette as PaletteIcon,
  Pin,
  Plug,
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
   write (a [[link]] resolves as you type), split (⌘-click opens it beside
   this note), connect (the graph opens as a tab), find (⌘K). It only plays
   while on screen; reduced motion gets the finished writing frame. */

const SCENES = [
  { id: "write", label: "Write", ms: 4600 },
  { id: "split", label: "Split", ms: 5800 },
  { id: "connect", label: "Connect", ms: 4400 },
  { id: "find", label: "Find", ms: 3800 },
] as const;
type Scene = (typeof SCENES)[number]["id"];

const TYPED = "Next, polish the editor pass and ship it — see ";
const LINK = "Release notes";
const TYPED_FULL = `${TYPED}[[${LINK}]]`;

/* ── Sidebar ─────────────────────────────────────────────────────────── */

/* Mirrors src/components/layout/Sidebar.tsx: traffic-light clearance, ⌘K
   search, vault name, pinned notes, the Notes header with its tools, and the
   tree (selection is the light `active` fill, not an inverted pill).
   Settings lives in the status bar now, not in a sidebar footer. */

type TreeNode = { label: string; depth: number; kind: "folder" | "file"; open?: boolean };
const PINNED = ["Q3 Roadmap", "Reading list"];
const TREE: TreeNode[] = [
  { label: "Projects", depth: 0, kind: "folder", open: true },
  { label: "Q3 Roadmap", depth: 1, kind: "file" },
  { label: "Release notes", depth: 1, kind: "file" },
  { label: "Architecture", depth: 1, kind: "file" },
  { label: "Research", depth: 0, kind: "folder" },
  { label: "Journal", depth: 0, kind: "folder" },
  { label: "Reading list", depth: 0, kind: "file" },
];

function QuickRow({ icon: Icon, label, keys }: { icon: typeof Search; label: string; keys?: string }) {
  return (
    <div className="flex h-[28px] items-center gap-2.5 rounded-md px-2.5 text-[12.5px] text-muted-foreground">
      <Icon size={14} strokeWidth={1.75} className="shrink-0 text-faint" />
      <span className="truncate">{label}</span>
      {keys && <kbd className="ml-auto font-mono text-[10px] font-normal text-faint">{keys}</kbd>}
    </div>
  );
}

function Sidebar({ active }: { active: string | null }) {
  return (
    <aside className="relative hidden w-[240px] shrink-0 flex-col border-r border-line-soft bg-panel sm:flex">
      {/* The collapse control: a round chevron riding the sidebar's edge. */}
      <span className="absolute right-0 top-1/2 z-10 grid size-[22px] -translate-y-1/2 translate-x-1/2 place-items-center rounded-full border border-border bg-background text-faint opacity-80 shadow-sm">
        <ChevronLeft size={13} strokeWidth={2} />
      </span>
      {/* The app leaves this band for the window's traffic lights. */}
      <div className="flex h-12 items-center gap-2 px-4 pt-1">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
      </div>
      <div className="px-2 pb-2">
        <div className="flex w-full items-center gap-2 rounded-md border border-line-soft bg-background px-2.5 py-1.5 text-[12.5px] text-faint">
          <Search size={14} strokeWidth={2} className="shrink-0" />
          <span>Search notes…</span>
          <kbd className="ml-auto rounded border border-border bg-panel px-1 font-mono text-[10px] leading-4 text-faint">
            ⌘K
          </kbd>
        </div>
        <div className="mt-1.5 flex flex-col gap-px">
          <QuickRow icon={CalendarDays} label="New daily note" keys="⌘J" />
          <QuickRow icon={ListChecks} label="Tasks" />
        </div>
        <div className="mt-2 grid grid-cols-2 rounded-md bg-sunken p-0.5 text-[12px]">
          <span className="rounded-[5px] bg-background py-[3px] text-center text-foreground shadow-sm">Notes</span>
          <span className="py-[3px] text-center text-muted-foreground">Projects</span>
        </div>
      </div>
      <div className="px-4 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">My Notes</span>
      </div>

      <div className="px-2 pb-2">
        <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Pinned</div>
        {PINNED.map((label) => (
          <div key={label} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-foreground">
            <Pin size={12} strokeWidth={2} className="shrink-0 text-faint" />
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pb-1 pl-4 pr-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Notes</span>
        <span className="flex items-center text-faint">
          {[ArrowDownAZ, Hash, FilePlus, FolderPlus].map((Icon, index) => (
            <span key={index} className="grid size-[26px] place-items-center">
              <Icon size={14.5} strokeWidth={1.75} />
            </span>
          ))}
        </span>
      </div>
      <div className="min-h-0 flex-1 px-2 pt-1">
        {TREE.map((node) => {
          const Icon = node.kind === "folder" ? (node.open ? FolderOpen : Folder) : FileText;
          const selected = node.label === active && node.kind === "file";
          return (
            <div
              key={node.label}
              className={cn(
                "relative flex h-[30px] items-center rounded-md pr-1.5 text-[13px]",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
              style={{ paddingLeft: 8 + node.depth * 15 }}
            >
              {selected && (
                <motion.span
                  layoutId="hero-tree-selection"
                  transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                  className="absolute inset-0 rounded-md bg-active"
                />
              )}
              <Icon
                size={14}
                strokeWidth={1.75}
                className={cn("relative mr-2 shrink-0", selected ? "text-foreground" : "text-faint")}
              />
              <span className={cn("relative truncate", node.kind === "folder" && "font-medium")}>
                {node.label}
              </span>
            </div>
          );
        })}
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

type TabId = "Q3 Roadmap" | "Release notes" | "graph";

function TabStrip({ scene, activeTab }: { scene: Scene; activeTab: TabId }) {
  return (
    <div className="flex h-11 shrink-0 items-stretch gap-1.5 bg-panel pl-2.5 pr-3">
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <Tab label="Q3 Roadmap" active={activeTab === "Q3 Roadmap"} />
        <Tab label="Release notes" active={activeTab === "Release notes"} />
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
        {/* History arrows, then the breadcrumb. */}
        <span className="mr-2 flex items-center gap-0.5 text-muted-foreground">
          <span className="grid size-7 place-items-center"><ArrowLeft size={15} strokeWidth={1.9} /></span>
          <span className="grid size-7 place-items-center opacity-30"><ArrowRight size={15} strokeWidth={1.9} /></span>
        </span>
        <span className="text-muted-foreground">Projects</span>
        <ChevronRight size={13} strokeWidth={2} className="mx-1.5 text-faint" />
        <span className="font-semibold text-foreground">Q3 Roadmap</span>
        {/* The app's actions: quiet ghost buttons — source toggle, note menu. */}
        <span className="ml-auto flex items-center gap-0.5 text-muted-foreground">
          <span className="grid size-7 place-items-center rounded-md">
            <Code2 size={15} strokeWidth={1.75} />
          </span>
          <span className="grid size-7 place-items-center rounded-md">
            <MoreHorizontal size={16} strokeWidth={1.75} />
          </span>
          <span className="grid size-7 place-items-center rounded-md">
            <Columns2 size={15} strokeWidth={1.75} />
          </span>
        </span>
      </div>
      <div className="mx-auto max-w-[600px] px-8 pt-5 font-note sm:px-10">
        {/* UI mock, not document structure — no real headings here. */}
        <div role="presentation" className="text-[30px] font-[680] leading-tight tracking-[-0.025em] text-foreground">
          Q3 Roadmap
        </div>
        <div className="mt-4 space-y-4 text-[15.5px] leading-[1.7] text-foreground/85">
          <p>
            The quarter is about speed and focus — make writing feel instant, then connect
            the agents you already use.
          </p>
          <div role="presentation" className="pt-1 text-[20px] font-[580] tracking-[-0.012em] text-foreground">
            Milestones
          </div>
          <ul className="space-y-2">
            {["Instant note switching", "A link graph for the whole vault", "PDF export with bookmarks"].map(
              (item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="grid size-[18px] shrink-0 place-items-center rounded border border-[var(--app-accent)] bg-[var(--app-accent)] text-white">
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
                  className="rounded-[3px] text-[var(--app-accent)] underline decoration-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] underline-offset-[3px]"
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

/* ── Split view ──────────────────────────────────────────────────────── */

/* With a split open, every pane carries its own header (the single header
   above the workspace goes away); an unfocused pane's header fades back. */
function PaneBar({
  folder,
  title,
  focused,
  closable,
}: {
  folder: string;
  title: string;
  focused: boolean;
  closable?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center px-3 text-[13px] transition-opacity duration-150",
        !focused && "opacity-50",
      )}
    >
      <span className="mr-2 flex items-center text-muted-foreground">
        <span className="grid size-6 place-items-center"><ArrowLeft size={14} strokeWidth={1.9} /></span>
        <span className="grid size-6 place-items-center opacity-30"><ArrowRight size={14} strokeWidth={1.9} /></span>
      </span>
      <span className="truncate text-muted-foreground">{folder}</span>
      <ChevronRight size={12} strokeWidth={2} className="mx-1 shrink-0 text-faint" />
      <span className="truncate font-semibold text-foreground">{title}</span>
      <span className="ml-auto flex shrink-0 items-center text-muted-foreground">
        <span className="grid size-6 place-items-center"><Code2 size={14} strokeWidth={1.75} /></span>
        <span className="grid size-6 place-items-center"><MoreHorizontal size={15} strokeWidth={1.75} /></span>
        <span className="grid size-6 place-items-center"><Columns2 size={14} strokeWidth={1.75} /></span>
        {closable && <span className="grid size-6 place-items-center"><X size={14} strokeWidth={1.75} /></span>}
      </span>
    </div>
  );
}

function SplitPanes({ elapsed, still }: { elapsed: number; still: boolean }) {
  // The right pane opens after a ⌘-click on the link, then takes focus.
  const k = still ? 1 : Math.min(1, Math.max(0, (elapsed - 1100) / 750));
  const right = 0.5 * (1 - (1 - k) ** 3);
  const focusRight = !still && elapsed > 3900;
  const linkHot = !still && elapsed > 350 && elapsed < 1300;
  return (
    <div className="flex h-full bg-background">
      <div className="flex min-w-0 flex-col" style={{ width: `${(1 - right) * 100}%` }}>
        <PaneBar folder="Projects" title="Q3 Roadmap" focused={!focusRight} />
        <div className="font-note px-6 pt-3 sm:px-8">
          <div role="presentation" className="text-[24px] font-[680] leading-tight tracking-[-0.025em] text-foreground">
            Q3 Roadmap
          </div>
          <p className="mt-3 text-[14px] leading-[1.7] text-foreground/85">
            Next, polish the editor pass and ship it — see{" "}
            <span
              className={cn(
                "rounded-[3px] text-[var(--app-accent)] underline decoration-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] underline-offset-[3px] transition-colors duration-150",
                linkHot && "bg-foreground/10",
              )}
            >
              Release notes
            </span>
            .
          </p>
          <span
            aria-hidden
            className={cn(
              "mt-3 inline-flex rounded-md border border-border bg-panel px-2 py-1 font-mono text-[10px] text-muted-foreground transition-opacity duration-150",
              linkHot ? "opacity-100" : "opacity-0",
            )}
          >
            ⌘ click
          </span>
        </div>
      </div>
      <div aria-hidden className={cn("w-px shrink-0", right > 0.02 ? "bg-border" : "bg-transparent")} />
      <div className="flex min-w-0 flex-col overflow-hidden" style={{ width: `${right * 100}%` }}>
        <div className="flex min-w-[220px] flex-1 flex-col">
          <PaneBar folder="Projects" title="Release notes" focused={focusRight} closable />
          <div className="font-note px-6 pt-3 sm:px-8">
            <div role="presentation" className="text-[24px] font-[680] leading-tight tracking-[-0.025em] text-foreground">
              Release notes
            </div>
            <p className="mt-3 text-[14px] leading-[1.7] text-foreground/85">
              A quieter release: faster switching, a calmer sidebar, and a link graph for the whole vault.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Shortcut bar ────────────────────────────────────────────────────── */

/* The strip along the whole bottom of the window: the keys that matter for the
   current view on the left; on the right the cursor position, history and word
   count of the note, then the MCP plug, the theme switcher and Settings. */
function ShortcutBar({ graph }: { graph: boolean }) {
  const keys = graph
    ? [["⌘K", "Command palette"], ["⌘N", "New note"], ["⌘[", "Back"], ["⌘\\", "Toggle sidebar"]]
    : [["⌘K", "Command palette"], ["⌘N", "New note"], ["⌘J", "Today's note"], ["⌘F", "Find in note"], ["⌘[", "Back"]];
  return (
    <div className="flex h-7 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-line-soft bg-background px-3 text-[10.5px] text-faint">
      {keys.map(([combo, label]) => (
        <span key={combo} className="flex items-center gap-1.5">
          <kbd className="font-mono text-[10px] text-muted-foreground">{combo}</kbd>
          {label}
        </span>
      ))}
      <div className="ml-auto flex shrink-0 items-center gap-1 tabular-nums">
        {!graph && (
          <>
            <span className="mr-2">Ln 2, Col 48</span>
            <History size={12} strokeWidth={2} />
            <span className="mr-2">186 words</span>
          </>
        )}
        {[Plug, PaletteIcon, Settings].map((Icon, index) => (
          <span key={index} className="grid h-5 w-6 place-items-center">
            <Icon size={13.5} strokeWidth={2} />
          </span>
        ))}
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
      <p className="absolute bottom-3 left-4 text-[11px] tabular-nums text-faint">13 notes · 14 links</p>
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
  const activeTab: TabId =
    scene.id === "connect"
      ? "graph"
      : scene.id === "split" && !reduce && elapsed > 3900
        ? "Release notes"
        : "Q3 Roadmap";
  const graphPhase: GraphPhase = scene.id === "connect" && elapsed > 1500 ? "hover" : "rest";
  const query = "Release".slice(0, Math.max(0, Math.floor((elapsed - 500) / 110)));

  return (
    <div ref={ref}>
      {/* app-ui: the app's real palette and typeface inside the window. */}
      <div className="app-ui flex h-[480px] flex-col overflow-hidden rounded-xl border border-black/10 bg-background shadow-workbench sm:aspect-[16/10] sm:h-auto">
        <div className="flex min-h-0 flex-1">
          <Sidebar active={activeTab === "graph" ? null : activeTab} />
          <main className="flex min-w-0 flex-1 flex-col">
            <TabStrip scene={scene.id} activeTab={activeTab} />
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {scene.id === "connect" ? (
                <GraphPane phase={graphPhase} />
              ) : scene.id === "split" ? (
                <SplitPanes elapsed={elapsed} still={reduce} />
              ) : (
                <NotePane typed={typed} still={reduce} />
              )}
              <AnimatePresence>
                {scene.id === "find" && <Palette key="palette" query={query} />}
              </AnimatePresence>
            </div>
          </main>
        </div>
        <ShortcutBar graph={scene.id === "connect"} />
      </div>

      {/* Chapter rail: where the tour is, and a way to jump. */}
      <div className="mx-auto mt-6 grid max-w-[600px] grid-cols-4 gap-4">
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
