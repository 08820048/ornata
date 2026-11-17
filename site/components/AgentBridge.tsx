"use client";

import { motion, useReducedMotion } from "motion/react";
import { McpDemo } from "@/components/McpDemo";
import { EASE_OUT } from "@/lib/ease";
import { useCopy } from "@/lib/locale";
import { Kicker } from "./ui/kicker";

/** "Bring your own agent": MCP and the command line. */
export function AgentBridge() {
  const reduce = useReducedMotion();
  const copy = useCopy().agents;
  return (
    <section id="mcp" className="section-contain scroll-mt-16 px-3 sm:px-6">
      <div className="mx-auto w-full max-w-[1440px] border-x border-border bg-background">
        <article className="border-b border-border">
          <div className="grid items-center gap-12 px-5 py-16 sm:px-10 sm:py-20 lg:px-16 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:gap-16">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(5px)" }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
              className="max-w-xl"
            >
              <Kicker index="MCP">{copy.eyebrow}</Kicker>
              <h2 className="mt-5 text-balance font-serif text-[42px] leading-[0.98] tracking-[-0.035em] text-foreground sm:text-[56px]">
                {copy.title}
              </h2>
              <p className="mt-6 max-w-md text-pretty text-[15px] leading-7 text-muted-foreground">
                {copy.body}
              </p>
              <p className="mt-5 font-mono text-[11px] leading-6 text-faint">
                {copy.terminal}
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
