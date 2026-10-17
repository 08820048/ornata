"use client";

import { ArrowLeft, ArrowRight, Columns2, X } from "lucide-react";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* Split view as it behaves in the app: ⌘-click a link and the note opens
   beside this one, drag the divider to resize, close the pane when done.
   One looping clock drives it; it only plays while on screen, and reduced
   motion gets a settled two-pane frame. */

const LOOP = 6600;
/** [time, right pane's share of the width] — linear between keyframes. */
const KEYS: Array<[number, number]> = [
  [0, 0],
  [1700, 0],
  [2300, 0.5],
  [3100, 0.5],
  [3900, 0.38],
  [4800, 0.38],
  [5400, 0],
  [LOOP, 0],
];

function share(t: number) {
  for (let i = 1; i < KEYS.length; i += 1) {
    const [t1, v1] = KEYS[i];
    if (t <= t1) {
      const [t0, v0] = KEYS[i - 1];
      const k = (t - t0) / (t1 - t0);
      // ease-out so panes settle instead of sliding linearly
      return v0 + (v1 - v0) * (1 - (1 - k) ** 3);
    }
  }
  return 0;
}

function Arrows() {
  return (
    <span className="mr-2 flex items-center text-muted-foreground">
      <ArrowLeft size={13} strokeWidth={1.9} />
      <ArrowRight size={13} strokeWidth={1.9} className="opacity-30" />
    </span>
  );
}

function PaneHeader({ title, closable, pressed }: { title: string; closable?: boolean; pressed?: boolean }) {
  return (
    <div className="flex h-9 shrink-0 items-center px-3 text-[12px]">
      <Arrows />
      <span className="truncate font-semibold text-foreground">{title}</span>
      <span className="ml-auto flex items-center gap-1 text-muted-foreground">
        <Columns2 size={13} strokeWidth={1.75} />
        {closable && (
          <X
            size={13}
            strokeWidth={1.75}
            className={cn("rounded transition-colors", pressed && "bg-active text-foreground")}
          />
        )}
      </span>
    </div>
  );
}

export function SplitDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const reduce = Boolean(useReducedMotion());
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const started = performance.now() - t;
    const timer = window.setInterval(() => setT((performance.now() - started) % LOOP), 40);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce]);

  const at = reduce ? 2800 : t;
  const right = share(at);
  const linkHot = at > 900 && at < 2300; // ⌘-click lands on the link
  const dragging = at > 3100 && at < 4000;
  const closing = at > 4800 && at < 5500;

  return (
    <div ref={ref} className="surface overflow-hidden rounded-[18px] bg-paper p-2">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">Side by side</span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-faint">⌘↵ · ⌘-click</span>
      </div>
      <div className="app-ui relative flex h-[320px] overflow-hidden rounded-[10px] bg-background">
        <div className="flex min-w-0 flex-col" style={{ width: `${(1 - right) * 100}%` }}>
          <PaneHeader title="Q3 Roadmap" />
          <div className="font-note px-5 pt-2 text-[13px] leading-[1.7] text-foreground/85">
            <div role="presentation" className="text-[22px] font-[650] leading-tight tracking-[-0.02em] text-foreground">
              Q3 Roadmap
            </div>
            <p className="mt-3">
              Ship the editor pass first, then write it up in{" "}
              <span
                className={cn(
                  "rounded-[3px] underline decoration-border-strong underline-offset-[3px] transition-colors duration-150",
                  linkHot ? "bg-foreground/10 text-foreground" : "text-foreground",
                )}
              >
                Release notes
              </span>
              .
            </p>
            <p className="mt-2 text-muted-foreground">Milestones stay on the left while you read on the right.</p>
            <span
              aria-hidden
              className={cn(
                "mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2 py-1 font-mono text-[10px] text-muted-foreground transition-opacity duration-150",
                linkHot ? "opacity-100" : "opacity-0",
              )}
            >
              ⌘ click
            </span>
          </div>
        </div>

        <div
          aria-hidden
          className={cn(
            "relative z-10 w-px shrink-0 transition-colors duration-100",
            right > 0.02 ? (dragging ? "bg-foreground/45" : "bg-border") : "bg-transparent",
          )}
        />

        <div className="flex min-w-0 flex-col overflow-hidden" style={{ width: `${right * 100}%` }}>
          <div className="flex min-w-[150px] flex-1 flex-col">
            <PaneHeader title="Release notes" closable pressed={closing} />
            <div className="font-note px-5 pt-2 text-[13px] leading-[1.7] text-foreground/85">
              <div role="presentation" className="text-[22px] font-[650] leading-tight tracking-[-0.02em] text-foreground">
                Release notes
              </div>
              <p className="mt-3">A quieter release: faster switching, a calmer sidebar, and a link graph.</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>• Instant tab switching</li>
                <li>• Split view</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
