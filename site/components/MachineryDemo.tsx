"use client";

import { Blocks, Cloud, Database, LayoutGrid, RefreshCw, Sparkles, Tags } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/ease";

/* "The position", shown rather than told: a notes app wearing its machinery
   (plugins, sync, a private database, dashboards) sheds all of it until only
   the plain Markdown file is left — which is what Ornata keeps. */

const MACHINERY = [
  { icon: Blocks, label: "14 plugins" },
  { icon: RefreshCw, label: "Syncing…" },
  { icon: Database, label: "vault.db" },
  { icon: LayoutGrid, label: "Dashboards" },
  { icon: Tags, label: "Schemas" },
  { icon: Sparkles, label: "AI, always on" },
  { icon: Cloud, label: "Account" },
] as const;

const FILE_LINES = [
  { text: "# Q3 Roadmap", tone: "text-foreground" },
  { text: "", tone: "" },
  { text: "Make writing feel instant.", tone: "text-muted-foreground" },
  { text: "", tone: "" },
  { text: "- [x] Instant note switching", tone: "text-muted-foreground" },
  { text: "- [ ] Ship the editor pass", tone: "text-muted-foreground" },
  { text: "", tone: "" },
  { text: "See [Release notes](release-notes.md)", tone: "text-muted-foreground" },
] as const;

export function MachineryDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const [plain, setPlain] = useState(false);

  useEffect(() => {
    if (!inView || reduce) return;
    const timer = window.setInterval(() => setPlain((p) => !p), plain ? 4200 : 2600);
    return () => window.clearInterval(timer);
  }, [inView, reduce, plain]);

  // Reduced motion shows the point, not the problem.
  const showPlain = reduce ? true : plain;

  return (
    <div ref={ref} className="surface overflow-hidden rounded-[18px] bg-paper p-2">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">
          {showPlain ? "What Ornata keeps" : "What notes apps add"}
        </span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-faint">
          {showPlain ? "roadmap.md" : "7 systems"}
        </span>
      </div>

      <div className="relative min-h-[300px] overflow-hidden rounded-[10px] bg-card p-5 sm:p-6">
        {/* The machinery: chips that crowd the note, then fall away. */}
        <div className="absolute inset-x-5 top-5 flex flex-wrap gap-1.5 sm:inset-x-6">
          <AnimatePresence>
            {!showPlain &&
              MACHINERY.map(({ icon: Icon, label }, index) => (
                <motion.span
                  key={label}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8, filter: "blur(3px)" }}
                  transition={{ duration: 0.3, ease: EASE_OUT, delay: index * 0.05 }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-paper px-2 py-1 text-[11px] text-muted-foreground"
                >
                  <Icon size={11} className="text-faint" />
                  {label}
                </motion.span>
              ))}
          </AnimatePresence>
        </div>

        {/* The file itself — always there, just buried until the rest goes. */}
        <motion.div
          initial={false}
          animate={{ y: showPlain ? 0 : 76, opacity: showPlain ? 1 : 0.35 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="relative font-mono text-[11.5px] leading-[1.9]"
        >
          {FILE_LINES.map((line, index) => (
            <p key={index} className={line.tone || "h-[1.9em]"}>
              {line.text}
            </p>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
