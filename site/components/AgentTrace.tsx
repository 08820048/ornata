"use client";

import {
  ArrowUp,
  Check,
  Copy,
  Eye,
  FileText,
  PencilLine,
  Terminal,
  TextQuote,
} from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

const PERMISSIONS = [
  { icon: Eye, label: "Read only", detail: "Inspect and answer" },
  { icon: PencilLine, label: "Read & write", detail: "Create and update" },
  { icon: Terminal, label: "Full Access", detail: "Every Pi tool" },
] as const;

const RESPONSE = [
  "## A tighter release plan",
  "",
  "1. Finish the editor pass",
  "2. Verify signed updates",
  "3. Publish the release notes",
] as const;

export function AgentTrace() {
  const reduce = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { margin: "-18% 0px" });
  const [permission, setPermission] = useState(0);

  useEffect(() => {
    if (reduce || !inView) return;
    const timer = window.setInterval(
      () => setPermission((current) => (current + 1) % PERMISSIONS.length),
      2200,
    );
    return () => window.clearInterval(timer);
  }, [inView, reduce]);

  const rise = (delay = 0) =>
    reduce
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 18, filter: "blur(5px)" },
          whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.55, ease: EASE_OUT, delay },
        };

  return (
    <section
      id="agent"
      className="section-contain scroll-mt-16 px-3 sm:px-6"
    >
      <div className="mx-auto grid w-full max-w-[1440px] overflow-hidden bg-night text-night-ink lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-night-line px-8 py-16 lg:flex lg:flex-col lg:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-night-muted">
            Invited,
            <br />
            never imposed
          </p>
          <span className="font-mono text-[10px] text-night-muted">07 / Pi</span>
        </aside>

        <div className="px-5 py-20 sm:px-10 lg:px-16 lg:py-28">
          <div className="grid items-end gap-10 xl:grid-cols-[minmax(0,1fr)_420px]">
            <motion.div {...rise()}>
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-night-muted">
                <span className="size-1.5 rounded-full bg-night-ink" />
                AssistantPi · available now
              </p>
              <h2 className="mt-6 max-w-3xl text-balance font-serif text-[48px] leading-[0.98] tracking-[-0.04em] sm:text-[68px] lg:text-[78px]">
                Intelligence that waits to be asked.
              </h2>
            </motion.div>

            <motion.div {...rise(0.08)} className="xl:pb-1">
              <p className="max-w-md text-pretty text-[15px] leading-7 text-night-muted">
                AssistantPi connects to Pi on your Mac, uses the model you
                configure, and starts in read-only mode. The open note and your
                selection provide context; every broader permission is your
                decision.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Bring your own model and provider",
                  "Markdown replies with highlighted code",
                  "Explicit permission mode for every request",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-[13px] text-night-ink"
                  >
                    <span className="grid size-5 place-items-center rounded-full border border-night-line">
                      <Check size={11} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          <motion.div
            ref={stageRef}
            initial={reduce ? false : { opacity: 0, y: 26 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={{ duration: 0.65, ease: EASE_OUT, delay: 0.1 }}
            className="relative mt-16 min-h-[610px] overflow-hidden rounded-[20px] bg-night-panel p-4 shadow-agent sm:p-8"
          >
            <div className="paper-noise absolute inset-0 opacity-[0.14]" />
            <div className="relative h-[545px] overflow-hidden rounded-[12px] border border-night-line bg-night">
              <div className="flex h-12 items-center border-b border-night-line px-4">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-night-muted">
                  Q3 Roadmap.md
                </span>
              </div>
              <div className="max-w-2xl px-7 py-9 opacity-50 sm:px-12">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-night-muted">
                  Product / Roadmap
                </p>
                <h3 className="mt-4 font-serif text-[38px] leading-tight">
                  A focused third quarter.
                </h3>
                <div className="mt-6 space-y-3">
                  <span className="block h-1.5 w-full rounded-full bg-night-ink/14" />
                  <span className="block h-1.5 w-[88%] rounded-full bg-night-ink/10" />
                  <span className="block h-1.5 w-[73%] rounded-full bg-night-ink/8" />
                </div>
              </div>

              <motion.div
                initial={reduce ? false : { opacity: 0, x: 22, scale: 0.98 }}
                whileInView={
                  reduce ? undefined : { opacity: 1, x: 0, scale: 1 }
                }
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.28 }}
                className="surface absolute bottom-3 right-3 top-3 flex w-[calc(100%-24px)] max-w-[520px] flex-col overflow-hidden rounded-[16px] bg-paper text-foreground sm:w-[58%]"
              >
                <header className="grid h-12 shrink-0 place-items-center border-b border-border px-10">
                  <span className="font-mono text-[9px] text-faint">
                    your configured model
                  </span>
                </header>

                <div className="min-h-0 flex-1 overflow-hidden p-4 sm:p-5">
                  <div className="rounded-xl bg-card p-3">
                    <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                      <FileText size={12} />
                      Current note · Q3 Roadmap
                    </div>
                    <div className="mt-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                      <TextQuote size={12} />
                      Selection
                    </div>
                    <p className="mt-2 text-[11.5px] leading-5 text-muted-foreground">
                      Ship the editor pass, verify updates, then publish.
                    </p>
                  </div>

                  <p className="mt-4 text-[12.5px] leading-5">
                    Turn this into a concise release plan.
                  </p>

                  <div className="mt-5 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                        AssistantPi
                      </span>
                      <Copy size={12} className="text-faint" />
                    </div>
                    <div className="mt-3 font-mono text-[10.5px] leading-5 text-fg-soft">
                      {RESPONSE.map((line, index) => (
                        <motion.p
                          key={`${line}-${index}`}
                          initial={reduce ? false : { opacity: 0, y: 4 }}
                          whileInView={
                            reduce ? undefined : { opacity: 1, y: 0 }
                          }
                          viewport={{ once: true }}
                          transition={{
                            duration: 0.25,
                            ease: EASE_OUT,
                            delay: 0.6 + index * 0.1,
                          }}
                        >
                          {line || "\u00a0"}
                        </motion.p>
                      ))}
                    </div>
                  </div>
                </div>

                <footer className="shrink-0 p-3">
                  <div className="rounded-xl border border-border bg-paper p-2">
                    <p className="px-2 py-1 text-[11px] text-faint">
                      Ask Pi about your notes…
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="relative min-w-0 flex-1">
                        {PERMISSIONS.map(({ icon: Icon, label, detail }, index) => (
                          <motion.div
                            key={label}
                            animate={{
                              opacity: permission === index ? 1 : 0,
                              scale: permission === index ? 1 : 0.25,
                              filter:
                                permission === index
                                  ? "blur(0px)"
                                  : "blur(4px)",
                            }}
                            transition={{
                              type: "spring",
                              duration: 0.3,
                              bounce: 0,
                            }}
                            className={cn(
                              "flex h-9 items-center gap-2 rounded-lg bg-card px-2.5",
                              index !== 0 && "absolute inset-0",
                            )}
                          >
                            <Icon size={12} className="shrink-0 text-muted-foreground" />
                            <span className="truncate text-[10px] font-medium">
                              {label}
                            </span>
                            <span className="hidden truncate text-[9px] text-faint md:inline">
                              · {detail}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                        <ArrowUp size={14} strokeWidth={2.2} />
                      </span>
                    </div>
                  </div>
                </footer>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
