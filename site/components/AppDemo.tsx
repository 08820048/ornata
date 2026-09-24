"use client";

import {
  ChevronRight,
  Copy,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  PanelLeft,
  Settings,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/* ── Sidebar ─────────────────────────────────────────────────────────── */

type Node = { label: string; depth: number; kind: "folder" | "file"; open?: boolean; active?: boolean };
const TREE: Node[] = [
  { label: "Projects", depth: 0, kind: "folder", open: true },
  { label: "Q3 Roadmap", depth: 1, kind: "file", active: true },
  { label: "App architecture", depth: 1, kind: "file" },
  { label: "Journal", depth: 0, kind: "folder" },
  { label: "Reading list", depth: 0, kind: "file" },
  { label: "Release notes", depth: 0, kind: "file" },
];

function TreeRow({ node }: { node: Node }) {
  const Icon = node.kind === "folder" ? (node.open ? FolderOpen : Folder) : FileText;
  const active = node.active;
  return (
    <div
      className={cn(
        "flex h-[30px] items-center rounded-md pr-1.5 text-[13px] transition-colors",
        active ? "bg-active text-foreground" : "text-muted-foreground",
      )}
      style={{ paddingLeft: 8 + node.depth * 15 }}
    >
      <Icon
        size={14}
        strokeWidth={1.75}
        className={cn("mr-2 shrink-0", active ? "text-foreground" : "text-faint")}
      />
      <span className={cn("truncate", node.kind === "folder" && "font-medium")}>{node.label}</span>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-line-soft bg-panel sm:flex">
      <div className="flex items-center px-4 pb-2 pt-4">
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          My Notes
        </span>
      </div>
      <div className="flex items-center justify-between pb-1 pl-4 pr-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Notes</span>
        <div className="flex items-center gap-0.5 text-faint">
          <FilePlus size={14.5} strokeWidth={1.75} />
          <FolderPlus size={14.5} strokeWidth={1.75} />
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-2 pt-1">
        {TREE.map((n) => (
          <TreeRow key={n.label} node={n} />
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line-soft px-3 py-2 text-faint">
        <Settings size={15} strokeWidth={1.75} />
      </div>
    </aside>
  );
}

/* ── Top rows ────────────────────────────────────────────────────────── */

const TABS = ["Q3 Roadmap", "Release notes", "App architecture"];

function Tabs() {
  return (
    <div className="flex h-11 shrink-0 items-stretch gap-1.5 bg-sunken pl-2.5 pr-3">
      <div className="flex shrink-0 items-center">
        <span className="grid h-7 w-7 place-items-center rounded-md text-faint">
          <PanelLeft size={15.5} strokeWidth={1.75} />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        {TABS.map((t, i) => (
          <div
            key={t}
            className={cn(
              "relative flex h-full min-w-0 max-w-[180px] shrink-0 items-center gap-1 pl-3 pr-1.5 text-[12.5px]",
              i === 0 ? "bg-background text-foreground" : "text-muted-foreground",
            )}
          >
            <span className="relative z-10 truncate">{t}</span>
            <span className={cn("relative z-10 grid h-5 w-5 shrink-0 place-items-center rounded", i === 0 ? "opacity-60" : "opacity-0")}>
              <X size={11} strokeWidth={2} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pill({ icon: Icon, children }: { icon: typeof Copy; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 select-none items-center gap-1.5 rounded-md border border-border bg-hover px-2.5 text-[12.5px] font-medium text-foreground">
      <Icon size={12.5} strokeWidth={2} />
      {children}
    </span>
  );
}

function TopRow() {
  return (
    <div className="flex h-10 shrink-0 items-center px-3">
      <div className="flex min-w-0 items-center gap-1.5 text-[13.5px]">
        <span className="shrink-0 truncate text-muted-foreground">Projects</span>
        <ChevronRight size={13} strokeWidth={2} className="shrink-0 text-faint" />
        <span className="shrink-0 font-semibold text-foreground">Q3 Roadmap</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Pill icon={Copy}>Copy path</Pill>
      </div>
    </div>
  );
}

/* ── Panes ───────────────────────────────────────────────────────────── */

function Properties() {
  const rows: { k: string; v: React.ReactNode }[] = [
    { k: "Status", v: <span className="text-foreground">Shipping</span> },
    {
      k: "Tags",
      v: (
        <div className="flex flex-wrap gap-1">
          {["planning", "q3"].map((t) => (
            <span key={t} className="rounded-full bg-hover px-2 py-0.5 text-[11.5px] leading-none text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      ),
    },
    { k: "Updated", v: <span className="text-foreground">2024-07-08</span> },
  ];
  return (
    <div className="mb-5 mt-1 border-b border-border pb-3">
      <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        <ChevronRight size={12} strokeWidth={2.5} className="rotate-90" />
        Properties
      </div>
      <div className="flex flex-col gap-0.5 pt-1">
        {rows.map((r) => (
          <div key={r.k} className="flex items-start gap-3 py-0.5 text-[12.5px]">
            <span className="w-24 shrink-0 truncate capitalize text-faint">{r.k}</span>
            <div className="min-w-0 flex-1">{r.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotePane({ still }: { still: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[620px] px-8 pt-6 sm:px-10">
      <Properties />
      {/* UI mock, not document structure — a real h1 here would fight the
          page's own heading outline. */}
      <div
        role="presentation"
        className="text-[30px] font-[680] tracking-[-0.025em] text-foreground"
      >
        Q3 Roadmap
      </div>
      <div className="mt-4 space-y-4 text-[15px] leading-[1.75] text-foreground/85">
        <p>
          The quarter is about speed and focus — make writing feel instant, then
          let AssistantPi help only when it is invited.
        </p>
        <h2 className="pt-1 text-[19px] font-semibold tracking-[-0.01em] text-foreground">Milestones</h2>
        <ul className="space-y-2">
          {[
            { done: true, text: "Persistent editor — instant note switching" },
            { done: true, text: "AssistantPi with three permission modes" },
            { done: true, text: "External Markdown files and image paste" },
          ].map((t) => (
            <li key={t.text} className="flex items-center gap-2.5">
              <span className={cn("grid size-[18px] shrink-0 place-items-center rounded border", t.done ? "border-foreground bg-foreground text-background" : "border-border-strong")}>
                {t.done ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </span>
              <span className={cn(t.done && "text-muted-foreground line-through decoration-faint")}>{t.text}</span>
            </li>
          ))}
        </ul>
        <p>
          Details live in the{" "}
          <span className="cursor-text text-foreground underline decoration-border underline-offset-2">Release notes</span>.
          See also the app architecture
          {still ? null : (
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
  );
}

/* ── Window ──────────────────────────────────────────────────────────── */

export function AppDemo() {
  const reduce = useReducedMotion();

  return (
    <div
      className="overflow-hidden rounded-xl border border-border-strong bg-background shadow-workbench"
    >
      <div className="flex items-center gap-2 border-b border-border bg-sunken px-4 py-3">
        <span className="size-3 rounded-full bg-foreground/20" />
        <span className="size-3 rounded-full bg-foreground/12" />
        <span className="size-3 rounded-full bg-foreground/[0.08]" />
      </div>
      <div className="flex h-[500px] sm:aspect-[16/10] sm:h-auto">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <Tabs />
          <TopRow />
          <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
            <NotePane still={!!reduce} />
          </div>
        </main>
      </div>
    </div>
  );
}
