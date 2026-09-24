"use client";

import { Check, CheckCircle2, Circle, FileText, ChevronRight } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

const TASKS_DATA = [
  {
    title: "Product principles",
    path: "projects/ornata/principles.md",
    tasks: [
      { text: "Draft the core values", done: true },
      { text: "Add examples for each principle", done: false },
      { text: "Review with the team", done: false },
    ],
  },
  {
    title: "Q3 Roadmap",
    path: "projects/ornata/roadmap.md",
    tasks: [
      { text: "Define milestones", done: true },
      { text: "Set release dates", done: true },
      { text: "Allocate resources", done: false },
    ],
  },
  {
    title: "Journal",
    path: "journal/weekly.md",
    tasks: [
      { text: "Write reflection", done: false },
      { text: "Plan next week", done: false },
    ],
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

export function TasksDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const active = useCycle(Boolean(inView && !reduce), TASKS_DATA.length, 2200);

  return (
    <div ref={ref} className="surface overflow-hidden rounded-[18px] bg-paper p-2">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">
          Open Tasks
        </span>
        <span className="flex gap-1.5">
          <span className="size-1.5 rounded-full bg-foreground/18" />
          <span className="size-1.5 rounded-full bg-foreground/10" />
        </span>
      </div>
      <div className="min-h-[340px] bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
            {TASKS_DATA.reduce((sum, item) => sum + item.tasks.filter(t => !t.done).length, 0)} open tasks
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
            vault-wide
          </span>
        </div>

        <div className="space-y-2">
          {TASKS_DATA.map((item, index) => {
            const isActive = index === active;
            const openCount = item.tasks.filter(t => !t.done).length;
            return (
              <div
                key={item.title}
                className="relative rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-foreground/3"
              >
                {isActive && (
                  <motion.div
                    layoutId="task-active"
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
                        {openCount > 0 && (
                          <span
                            className={cn(
                              "flex items-center gap-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px]",
                              isActive ? "text-foreground" : "text-faint",
                            )}
                          >
                            <Circle size={8} fill="currentColor" />
                            {openCount}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {item.tasks.slice(0, 2).map((task, tIndex) => (
                          <div
                            key={tIndex}
                            className="flex items-center gap-2"
                          >
                            {task.done ? (
                              <CheckCircle2
                                size={10}
                                className={cn(
                                  "shrink-0",
                                  isActive ? "text-foreground/60" : "text-faint/60",
                                )}
                              />
                            ) : (
                              <Circle
                                size={10}
                                className={cn(
                                  "shrink-0",
                                  isActive ? "text-foreground" : "text-faint",
                                )}
                              />
                            )}
                            <span
                              className={cn(
                                "truncate text-[10.5px]",
                                task.done
                                  ? "line-through opacity-50"
                                  : isActive
                                    ? "text-muted-foreground"
                                    : "text-faint",
                              )}
                            >
                              {task.text}
                            </span>
                          </div>
                        ))}
                        {item.tasks.length > 2 && (
                          <div className="font-mono text-[8.5px] text-faint">
                            +{item.tasks.length - 2} more
                          </div>
                        )}
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
          <Check size={11} />
          Click to complete tasks
        </div>
      </div>
    </div>
  );
}
