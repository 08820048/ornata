"use client";

import { ArrowUpRight, FileText, ChevronRight } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

const BACKLINKS_DATA = [
  {
    title: "Q3 Roadmap",
    folder: "projects/ornata",
    snippets: [
      "See [Product principles](../principles.md) for context",
      "As mentioned in [Release notes](../releases.md)",
    ],
  },
  {
    title: "Journal",
    folder: "",
    snippets: ["Today I worked on the principles doc"],
  },
  {
    title: "Meeting notes",
    folder: "work",
    snippets: ["Discussed the new product principles"],
  },
];

function useCycle(enabled: boolean, length: number, delay: number) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % length),
      delay,
    );
    return () => window.clearInterval(timer);
  }, [delay, enabled, length]);

  return active;
}

export function BacklinksDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const active = useCycle(Boolean(inView && !reduce), BACKLINKS_DATA.length, 2000);

  return (
    <div ref={ref} className="surface overflow-hidden rounded-[18px] bg-paper p-2">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">
          Linked Mentions
        </span>
        <span className="flex gap-1.5">
          <span className="size-1.5 rounded-full bg-foreground/18" />
          <span className="size-1.5 rounded-full bg-foreground/10" />
        </span>
      </div>
      <div className="min-h-[340px] bg-card p-4">
        <div className="mb-4 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
            3 notes link here
          </span>
        </div>

        <div className="space-y-2">
          {BACKLINKS_DATA.map((item, index) => {
            const isActive = index === active;
            return (
              <div
                key={item.title}
                className="relative rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-foreground/3"
              >
                {isActive && (
                  <motion.div
                    layoutId="backlink-active"
                    className="absolute inset-0 rounded-lg bg-foreground/5"
                    transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                  />
                )}
                <div className="relative flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText
                      size={13}
                      className={cn(
                        "shrink-0",
                        isActive ? "text-foreground" : "text-faint",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-[12px] font-medium",
                            isActive ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {item.title}
                        </span>
                        {item.folder && (
                          <span
                            className={cn(
                              "truncate text-[10px]",
                              isActive ? "text-faint" : "text-faint/60",
                            )}
                          >
                            {item.folder}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-1">
                        {item.snippets.map((snippet, sIndex) => (
                          <div
                            key={sIndex}
                            className={cn(
                              "truncate text-[10.5px] leading-snug",
                              isActive ? "text-muted-foreground" : "text-faint",
                            )}
                          >
                            {snippet}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    size={12}
                    className={cn(
                      "ml-2 shrink-0",
                      isActive ? "text-foreground/70" : "text-faint",
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
          <ArrowUpRight size={11} />
          Click to open source note
        </div>
      </div>
    </div>
  );
}
