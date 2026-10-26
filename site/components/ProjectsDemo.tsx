"use client";

import { Bot, Check } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Status = "todo" | "doing" | "done";

const COLUMNS: { status: Status; label: string }[] = [
  { status: "todo", label: "Todo" },
  { status: "doing", label: "In progress" },
  { status: "done", label: "Done" },
];

const LINES = [
  "- [ ] Spring switch for the sidebar #motion !high",
  "- [/] Spring switch for the sidebar #motion !high +claude-code",
  "- [x] Spring switch for the sidebar #motion !high ✓by:claude-code",
];

const SPRING = { type: "spring", duration: 0.45, bounce: 0.12 } as const;

type Card = { id: string; title: string; tag: string; status: Status | null };

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded bg-foreground/8 px-1.5 text-[9.5px] leading-[16px] text-muted-foreground",
        className,
      )}
    >
      {children}
    </motion.span>
  );
}

export function ProjectsDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const timer = window.setInterval(() => setStep((s) => (s + 1) % 4), 1900);
    return () => window.clearInterval(timer);
  }, [inView, reduce]);

  const phase = Math.min(step, 2);
  const live: Status = (["todo", "doing", "done"] as const)[phase];

  const cards: Card[] = [
    { id: "a", title: "Board empty states", tag: "design", status: "todo" },
    { id: "live", title: "Spring switch for the sidebar", tag: "motion", status: live },
    { id: "b", title: "Turn a task into an issue page", tag: "editor", status: "doing" },
    { id: "c", title: "Priority ordering", tag: "board", status: "done" },
  ];

  return (
    <div ref={ref} className="surface overflow-hidden rounded-[18px] bg-paper p-2">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">
          Project board · Ornata
        </span>
        <span className="flex gap-1.5">
          <span className="size-1.5 rounded-full bg-foreground/18" />
          <span className="size-1.5 rounded-full bg-foreground/10" />
        </span>
      </div>
      <div className="overflow-hidden rounded-[10px] bg-card p-3">
        <div className="grid grid-cols-3 gap-2">
          {COLUMNS.map((column) => {
            const items = cards.filter((card) => card.status === column.status);
            return (
              <div key={column.status} className="min-h-[236px] rounded-lg bg-foreground/[0.035] p-1.5">
                <div className="flex items-center justify-between px-1.5 pb-2 pt-1 text-[10.5px] font-medium text-muted-foreground">
                  <span>{column.label}</span>
                  <span className="font-mono text-[9px] text-faint">{items.length}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {items.map((card) => {
                    const isLive = card.id === "live";
                    return (
                      <motion.div
                        key={card.id}
                        layout
                        layoutId={`card-${card.id}`}
                        transition={SPRING}
                        className={cn(
                          "rounded-md border bg-background px-2 py-1.5",
                          isLive ? "border-foreground/30" : "border-border",
                        )}
                      >
                        <p
                          className={cn(
                            "text-[10.5px] leading-[1.35]",
                            column.status === "done" ? "text-faint" : "text-foreground",
                          )}
                        >
                          {card.title}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="rounded bg-foreground/8 px-1.5 text-[9.5px] leading-[16px] text-muted-foreground">
                            #{card.tag}
                          </span>
                          {isLive && phase === 1 ? (
                            <Badge>
                              <Bot size={10} />
                              claude-code
                            </Badge>
                          ) : null}
                          {isLive && phase === 2 ? (
                            <Badge>
                              <Check size={10} />
                              claude-code
                            </Badge>
                          ) : null}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 overflow-hidden rounded-lg bg-foreground px-3 py-2.5 font-mono text-[9.5px] leading-5 text-primary-foreground">
          <p className="mb-1 text-primary-foreground/45">Tasks.md</p>
          <motion.p
            key={phase}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="truncate"
          >
            {LINES[phase]}
          </motion.p>
        </div>
      </div>
    </div>
  );
}
