"use client";

import { FilePlus2, FolderPlus, MousePointer2 } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* The Library tab: folders and notes as cards. A pointer walks across them;
   the folder under it lifts, leans its front back and lets its pages out one
   after another — the same springs the app uses (the demo UI stays English). */

const FOLDER_SPRING = { type: "spring", stiffness: 260, damping: 21 } as const;
const PAPER_SPRINGS = [
  { type: "spring", stiffness: 320, damping: 21 },
  { type: "spring", stiffness: 230, damping: 18 },
  { type: "spring", stiffness: 170, damping: 15.5 },
] as const;

/* Each page at rest and while the folder is open; index 0 is the front one. */
const PAPERS = [
  { rest: { y: 0, rotate: 0, x: 0 }, open: { y: -30, rotate: 0, x: 0 } },
  { rest: { y: -5, rotate: -3, x: -4 }, open: { y: -24, rotate: -9, x: -13 } },
  { rest: { y: -5, rotate: 3, x: 4 }, open: { y: -19, rotate: 8, x: 13 } },
] as const;

const FOLDERS = [
  { name: "Projects", count: "12 notes", title: "Q3 Roadmap", lines: [92, 78, 86, 54] },
  { name: "Journal", count: "48 notes", title: "Tuesday", lines: [84, 90, 62, 74] },
] as const;

/* Folder back: a rounded plate with a tab at the top left. */
const BACK =
  "M0 14 Q0 6 8 6 H36 Q41 6 44 10 L47 14 Q50 18 55 18 H92 Q100 18 100 26 V112 Q100 120 92 120 H8 Q0 120 0 112 Z";

function Lines({ widths }: { widths: readonly number[] }) {
  return (
    <span className="mt-1.5 block space-y-[3px]">
      {widths.map((width, i) => (
        <span
          key={i}
          className="block h-[2px] rounded-full bg-foreground/20"
          style={{ width: `${width}%` }}
        />
      ))}
    </span>
  );
}

function FolderCard({
  folder,
  open,
}: {
  folder: (typeof FOLDERS)[number];
  open: boolean;
}) {
  return (
    <motion.div
      animate={{ y: open ? -5 : 0 }}
      transition={FOLDER_SPRING}
      className="relative aspect-[5/6] w-full"
    >
      <svg
        viewBox="0 0 100 120"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-0 h-full w-full"
      >
        <path d={BACK} className="fill-foreground/[0.16]" />
      </svg>

      {[2, 1, 0].map((index) => (
        <motion.div
          key={index}
          animate={open ? PAPERS[index].open : PAPERS[index].rest}
          transition={PAPER_SPRINGS[index]}
          className="absolute left-[10%] top-[24%] h-[64%] w-[80%] rounded-[5px] bg-card px-[9%] py-[8%] shadow-[0_0_0_0.5px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.1)]"
        >
          {index === 0 ? (
            <>
              <span className="block truncate font-serif text-[10px] leading-none text-foreground sm:text-[11px]">
                {folder.title}
              </span>
              <Lines widths={folder.lines} />
            </>
          ) : (
            <Lines widths={[70, 88, 60]} />
          )}
        </motion.div>
      ))}

      {/* The front: translucent, so the pages show through its top edge. */}
      <motion.div
        animate={{ rotateX: open ? -16 : 0 }}
        transition={FOLDER_SPRING}
        style={{ transformOrigin: "50% 100%", transformPerspective: 500 }}
        className="absolute inset-x-0 bottom-0 flex h-[56%] flex-col justify-end rounded-[9px] border-t border-white/60 px-[9%] pb-[9%] shadow-[0_0_0_0.5px_rgba(0,0,0,0.1),0_-2px_6px_rgba(0,0,0,0.07)] dark:border-white/10"
      >
        {/* The fill is its own layer so the label stays fully opaque. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-[9px] opacity-[0.86]"
          style={{ background: "color-mix(in srgb, var(--fg) 9%, var(--card))" }}
        />
        <span className="relative block truncate text-[11px] font-medium leading-tight text-foreground sm:text-[12px]">
          {folder.name}
        </span>
        <span className="relative mt-0.5 block truncate text-[9px] text-muted-foreground">{folder.count}</span>
      </motion.div>
    </motion.div>
  );
}

function NoteCard({ hovered }: { hovered: boolean }) {
  return (
    <motion.div
      animate={{ y: hovered ? -4 : 0 }}
      transition={FOLDER_SPRING}
      className={cn(
        "relative aspect-[5/6] w-full overflow-hidden rounded-[9px] bg-card px-[10%] py-[10%] transition-shadow duration-150",
        hovered
          ? "shadow-[0_0_0_1px_rgba(0,0,0,0.16),0_8px_18px_rgba(0,0,0,0.1)]"
          : "shadow-[0_0_0_0.5px_rgba(0,0,0,0.1),0_2px_5px_rgba(0,0,0,0.05)]",
      )}
    >
      <span className="block font-serif text-[12px] leading-tight text-foreground sm:text-[13px]">
        Reading list
      </span>
      <Lines widths={[90, 74]} />
      <span className="mt-2 block space-y-[4px]">
        {[66, 80, 58].map((width, i) => (
          <span key={i} className="flex items-center gap-1">
            <span
              className={cn(
                "block size-[5px] shrink-0 rounded-[1.5px] border border-foreground/30",
                i === 0 && "border-transparent bg-foreground/55",
              )}
            />
            <span
              className="block h-[2px] rounded-full bg-foreground/20"
              style={{ width: `${width}%` }}
            />
          </span>
        ))}
      </span>
      <Lines widths={[84, 70, 88, 46]} />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-card to-transparent" />
    </motion.div>
  );
}

/* Where the pointer rests over each of the three cards. */
const POINTER = ["21%", "53%", "85%"];

export function LibraryDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const playing = Boolean(inView && !reduce);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setStep((s) => (s + 1) % 3), 2100);
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <div ref={ref}>
      <div className="surface overflow-hidden rounded-[18px] bg-paper p-2">
        <div className="flex h-9 items-center justify-between px-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">Library</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">
            My Notes
          </span>
        </div>
        <div className="app-ui relative overflow-hidden rounded-[10px] bg-card">
          <div className="flex items-center justify-between px-[6%] pt-5">
            <span className="text-[13px] font-medium text-foreground">My Notes</span>
            <span className="flex gap-2.5 text-faint">
              <FilePlus2 size={13} strokeWidth={1.75} />
              <FolderPlus size={13} strokeWidth={1.75} />
            </span>
          </div>
          <div className="grid grid-cols-3 items-end gap-[4%] px-[6%] pb-9 pt-12">
            <FolderCard folder={FOLDERS[0]} open={step === 0} />
            <FolderCard folder={FOLDERS[1]} open={step === 1} />
            <NoteCard hovered={step === 2} />
          </div>
          {!reduce && (
            <motion.div
              aria-hidden
              initial={false}
              animate={{ left: POINTER[step] }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
              className="pointer-events-none absolute top-[72%] text-foreground"
            >
              <MousePointer2 size={15} strokeWidth={1.6} className="fill-background" />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
