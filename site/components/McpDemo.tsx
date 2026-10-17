"use client";

import { Plug } from "lucide-react";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* Connecting an agent, start to finish: switch the server on in Ornata, add
   it to Claude Code with one line, ask for something, and watch the line
   appear in today's note. One looping clock; it only plays on screen, and
   reduced motion gets the finished frame. */

const LOOP = 11400;
const COMMAND = "claude mcp add ornata --transport http http://127.0.0.1:13200/mcp";
const PROMPT = `add "call Ada back" to today's note`;

const typed = (text: string, t: number, from: number, to: number) =>
  text.slice(0, Math.round(Math.max(0, Math.min(1, (t - from) / (to - from))) * text.length));

export function McpDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const reduce = Boolean(useReducedMotion());
  const [clock, setClock] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const started = performance.now() - clock;
    const timer = window.setInterval(() => setClock((performance.now() - started) % LOOP), 50);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce]);

  const t = reduce ? 9200 : clock;
  const on = t > 1200;
  const pressing = t > 800 && t < 1200;
  const added = t > 4000;
  const call1 = t > 6200;
  const noteLine = t > 6500;
  const call2 = t > 7100;
  const answer = t > 7800;
  const fade = !reduce && t > LOOP - 700;

  return (
    <div ref={ref} className="surface overflow-hidden rounded-[18px] bg-paper p-2">
      <div className="flex h-9 items-center justify-between px-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">Any agent</span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-faint">MCP · localhost</span>
      </div>
      <div
        className={cn(
          "grid gap-px overflow-hidden rounded-[10px] bg-border transition-opacity duration-500 sm:grid-cols-[1.1fr_1fr]",
          fade && "opacity-0",
        )}
      >
        {/* The agent's terminal. */}
        <div className="min-h-[300px] bg-night p-4 font-mono text-[11px] leading-[1.7] text-night-ink">
          <p className="text-night-muted [overflow-wrap:anywhere]">
            <span className="text-night-ink">$ </span>
            {typed(COMMAND, t, 1600, 3600)}
          </p>
          {added && <p className="text-night-muted">✔ Added ornata</p>}
          {t > 4500 && (
            <p className="mt-3 break-words">
              <span className="text-night-muted">&gt; </span>
              {typed(PROMPT, t, 4500, 5900)}
            </p>
          )}
          {call1 && (
            <p className="mt-2 flex gap-2 text-night-muted">
              <span>●</span>
              <span>add_to_daily_note</span>
              <span className="ml-auto text-night-ink">{noteLine ? "✓" : "…"}</span>
            </p>
          )}
          {call2 && (
            <p className="flex gap-2 text-night-muted">
              <span>●</span>
              <span>list_tasks</span>
              <span className="ml-auto text-night-ink">3 open</span>
            </p>
          )}
          {answer && (
            <p className="mt-3 text-night-ink">Added it to today&rsquo;s note. You have 3 open tasks.</p>
          )}
        </div>

        {/* Ornata, as the agent changes it. */}
        <div className="app-ui flex min-h-[300px] flex-col bg-background">
          <div
            className={cn(
              "m-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[11.5px] transition-colors duration-300",
              on ? "bg-[#4d8660]/12 text-foreground" : "bg-sunken text-muted-foreground",
            )}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full", on ? "bg-success" : "bg-faint")} />
            <span className="min-w-0 flex-1 truncate">
              {on ? "Server active · port 13200" : "MCP server is off"}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-md border border-border bg-background px-2 py-0.5 text-[10.5px] font-medium text-foreground transition-transform duration-150",
                pressing && "scale-95 bg-active",
              )}
            >
              {on ? "Disconnect" : "Connect"}
            </span>
          </div>

          <div className="font-note flex-1 px-5 pt-1">
            <p className="font-mono text-[9.5px] text-faint">journal / 2026-10-18.md</p>
            <div role="presentation" className="mt-2 text-[20px] font-[650] leading-tight tracking-[-0.02em] text-foreground">
              2026-10-18
            </div>
            <ul className="mt-3 space-y-1.5 text-[13px] text-foreground/85">
              <li className="flex items-center gap-2">
                <span className="size-3.5 rounded-[3px] border border-border-strong" />
                Send the Q3 roadmap
              </li>
              {noteLine && (
                <li className="flex items-center gap-2 rounded bg-[#4d8660]/12 px-1 -mx-1 transition-colors duration-700">
                  <span className="size-1 shrink-0 rounded-full bg-foreground/60" />
                  call Ada back
                </li>
              )}
            </ul>
          </div>

          <div className="flex h-7 items-center justify-between border-t border-line-soft px-3 text-[10px] text-faint">
            <span>⌘K Command palette</span>
            <Plug size={13} strokeWidth={2} className={cn("transition-colors duration-300", on ? "text-success" : "text-faint")} />
          </div>
        </div>
      </div>
    </div>
  );
}
