"use client";

import { motion, useReducedMotion } from "motion/react";
import { McpDemo } from "@/components/McpDemo";
import { EASE_OUT } from "@/lib/ease";

/** "Bring your own agent": MCP and the command line. */
export function AgentBridge() {
  const reduce = useReducedMotion();
  return (
    <section id="mcp" className="section-contain scroll-mt-16 px-3 sm:px-6">
      <div className="mx-auto w-full max-w-[1440px] border-x border-border bg-background">
        <article className="grid border-b border-border lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden border-r border-border px-8 py-14 lg:block">
            <span className="sticky top-28 block font-mono text-[10px] tracking-[0.14em] text-faint">
              08 / MCP
            </span>
          </aside>
          <div className="grid items-center gap-12 px-5 py-16 sm:px-10 sm:py-20 lg:px-16 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:gap-16">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(5px)" }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
              className="max-w-xl"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                Any agent, one vault
              </p>
              <h2 className="mt-5 text-balance font-serif text-[42px] leading-[0.98] tracking-[-0.035em] text-foreground sm:text-[56px]">
                Bring the agent you already use.
              </h2>
              <p className="mt-6 max-w-md text-pretty text-[15px] leading-7 text-muted-foreground">
                Ornata speaks MCP, so Claude Code, Codex, Cursor, and the rest can
                search your notes, add to today&rsquo;s page, and tick off tasks. You
                decide per vault what an agent may do — off, read only, or read &amp;
                write — and every edit keeps the old version in the note&rsquo;s history.
              </p>
              <p className="mt-5 font-mono text-[11px] leading-6 text-faint">
                Or from any terminal:
                <br />
                ornata search &ldquo;roadmap&rdquo;
                <br />
                echo &ldquo;ship it&rdquo; | ornata journal add
              </p>
            </motion.div>
            <McpDemo />
          </div>
        </article>
      </div>
    </section>
  );
}
