"use client";

import {
  ArrowUp,
  Check,
  Eye,
  FileEdit,
  FileText,
  ListTodo,
  PencilLine,
  Terminal,
  TextQuote,
} from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Grainient } from "./Grainient";
import { MONO } from "./grainient-presets";
import { EASE_OUT, SPRING_BOUNCE } from "@/lib/ease";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: FileText, label: "Read Q3 Roadmap", detail: "projects/roadmap.md" },
  { icon: FileEdit, label: "Updated the note", detail: "added a focused action plan" },
  { icon: ListTodo, label: "Added 3 todos", detail: "tagged #ornata" },
];

const PERMISSIONS = [
  { icon: Eye, label: "Read only" },
  { icon: PencilLine, label: "Read & write", active: true },
  { icon: Terminal, label: "Full Access" },
];

function useReplay(still: boolean, duration: number) {
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setCycle((c) => c + 1), duration);
    return () => clearInterval(id);
  }, [still, duration]);
  return cycle;
}

export function AgentTrace() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const still = !!reduce || !inView;
  const cycle = useReplay(still, 4800);

  const rise = (delay = 0) =>
    reduce
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 20, filter: "blur(6px)" },
          whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.6, ease: EASE_OUT, delay },
        };

  return (
    <section id="agent" className="w-full scroll-mt-24 px-4 py-24 sm:px-8">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <motion.span
            {...rise()}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 font-medium text-[12px] text-muted-foreground"
          >
            <span className="size-1.5 rounded-full bg-accent" /> Available now · AssistantPi
          </motion.span>
          <motion.h2
            {...rise(0.06)}
            className="mt-6 text-balance font-serif text-[32px] leading-tight text-foreground sm:text-[42px]"
          >
            Bring your own model. Choose exactly how far it can go.
          </motion.h2>
          <motion.p
            {...rise(0.12)}
            className="mt-5 text-pretty leading-8 text-muted-foreground"
          >
            AssistantPi connects to Pi already installed and configured on your
            Mac. Select a passage for context, choose a permission mode, and ask
            it to work across your notes, todos, and bookmarks.
          </motion.p>
          <motion.ul {...rise(0.18)} className="mt-7 flex flex-col gap-3">
            {[
              "Uses the model and provider you configure in Pi",
              "Read only by default; writing and destructive actions stay gated",
              "Full Access unlocks every Pi tool, including shell commands",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className="text-pretty text-[14.5px] leading-6 text-fg-soft">{line}</span>
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          {...rise(0.1)}
          ref={ref}
          className="relative overflow-hidden rounded-[2rem] border border-border p-5 sm:p-7"
        >
          <Grainient className="absolute inset-0" {...MONO} />
          <div className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-paper shadow-2xl">
            <div className="grid h-12 place-items-center px-12">
              <span className="truncate font-mono text-[11px] text-faint">
                your configured model
              </span>
            </div>

            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <div className="rounded-xl bg-card p-3">
                <div className="flex items-center gap-2 text-[10.5px] text-faint">
                  <TextQuote className="size-3.5" />
                  <span>Selection · Q3 Roadmap</span>
                </div>
                <p className="mt-2 line-clamp-2 text-pretty text-[12px] leading-5 text-fg-soft">
                  Ship the editor rewrite, then open up the workflow to AssistantPi.
                </p>
              </div>

              <p className="mt-3 text-pretty text-[13px] leading-6 text-foreground">
                Turn this into action items and add them to Todos.
              </p>

              <motion.div key={cycle} className="mt-4 flex flex-col gap-3">
                {STEPS.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <motion.div
                      key={step.label}
                      {...(still
                        ? {}
                        : {
                            initial: { opacity: 0, y: 8 },
                            animate: { opacity: 1, y: 0 },
                            transition: { duration: 0.3, ease: EASE_OUT, delay: 0.2 + i * 0.7 },
                          })}
                      className="flex items-start gap-3"
                    >
                      <motion.span
                        {...(still
                          ? {}
                          : {
                              initial: { scale: 0.5, opacity: 0 },
                              animate: { scale: 1, opacity: 1 },
                              transition: { ...SPRING_BOUNCE, delay: 0.35 + i * 0.7 },
                            })}
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full",
                          i === STEPS.length - 1
                            ? "bg-accent text-white"
                            : "bg-card text-fg-soft ring-1 ring-border",
                        )}
                      >
                        <Icon className="size-3.5" />
                      </motion.span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {step.label}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                          {step.detail}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>

              <div className="mt-5 rounded-2xl border border-border bg-paper p-2">
                <p className="px-2 pb-2 text-[12.5px] text-faint">Ask Pi about your notes…</p>
                <div className="flex items-end justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1 rounded-lg bg-card p-1">
                    {PERMISSIONS.map(({ icon: Icon, label, active }) => (
                      <span
                        key={label}
                        className={cn(
                          "inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-[10.5px] font-medium",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <Icon className="size-3 shrink-0" />
                        <span className="hidden truncate sm:inline">{label}</span>
                      </span>
                    ))}
                  </div>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <ArrowUp className="size-3.5" strokeWidth={2.2} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
