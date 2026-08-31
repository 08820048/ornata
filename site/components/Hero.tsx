"use client";

import Image from "next/image";
import { ArrowDownRight, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { AppDemo } from "./AppDemo";
import { DownloadButton } from "./ui/download-button";
import { EASE_OUT } from "@/lib/ease";

const FACTS = [
  ["Format", "Plain .md"],
  ["Storage", "Your folder"],
  ["Account", "Not required"],
  ["Build", "Signed & notarized"],
] as const;

function WindowsMark() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3 4.6 10.7 3.5v7.8H3V4.6Zm8.8-1.25L21 2v9.3h-9.2V3.35ZM3 12.4h7.7v7.9L3 19.2v-6.8Zm8.8 0H21V22l-9.2-1.3v-8.3Z" />
    </svg>
  );
}

export function Hero() {
  const reduce = useReducedMotion();
  const rise = (delay: number) =>
    reduce
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 16, filter: "blur(5px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.55, ease: EASE_OUT, delay },
        };

  return (
    <section className="px-3 pt-24 sm:px-6 sm:pt-28">
      <div className="mx-auto w-full max-w-[1440px] overflow-hidden border-x border-t border-border bg-paper">
        <div className="grid border-b border-border lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden border-r border-border px-8 py-12 lg:flex lg:flex-col lg:justify-between">
            <p className="font-mono text-[10px] uppercase leading-5 tracking-[0.16em] text-faint">
              Local-first
              <br />
              Markdown
              <br />
              for macOS
            </p>
            <a
              href="#principles"
              className="group inline-flex min-h-11 items-center gap-2 text-[12px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              Read the principles
              <ArrowDownRight
                size={14}
                className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
              />
            </a>
          </aside>

          <div className="relative overflow-hidden px-5 py-14 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
            <Image
              src="/ornata-mark-2026.png"
              alt=""
              width={420}
              height={420}
              priority
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 top-1/2 w-[260px] -translate-y-1/2 opacity-[0.055] sm:w-[360px] lg:right-0 lg:w-[420px]"
            />

            <motion.div {...rise(0)} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                A focused writing instrument
              </span>
            </motion.div>

            <div className="relative mt-8 grid items-end gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
              <motion.h1
                {...rise(0.06)}
                className="max-w-[860px] text-balance font-serif text-[54px] font-normal leading-[0.92] tracking-[-0.045em] text-foreground sm:text-[78px] lg:text-[98px]"
              >
                Markdown,
                <br />
                without the
                <br />
                machinery.
              </motion.h1>

              <div className="max-w-md xl:pb-2">
                <motion.p
                  {...rise(0.13)}
                  className="text-pretty text-[16px] leading-7 text-muted-foreground sm:text-[17px]"
                >
                  Ornata is a local-first Markdown notes app for macOS. It
                  keeps the editor fast, the interface quiet, and every note
                  as a plain .md file in a folder you own. No proprietary
                  database. No account required. Just a precise place to
                  write.
                </motion.p>
                <motion.div
                  {...rise(0.2)}
                  className="mt-7 flex flex-col gap-3 sm:flex-row"
                >
                  <DownloadButton className="w-full whitespace-nowrap sm:w-auto" />
                  <button
                    type="button"
                    disabled
                    aria-label="Windows download coming soon"
                    className="inline-flex h-12 w-full select-none items-center justify-center gap-2 whitespace-nowrap rounded-[11px] border border-border bg-panel px-6 text-[14px] font-medium text-muted-foreground opacity-70 sm:w-auto"
                  >
                    <WindowsMark />
                    Coming Soon
                  </button>
                </motion.div>
                <motion.p
                  {...rise(0.26)}
                  className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.11em] text-faint"
                >
                  <ShieldCheck size={12} />
                  Apple Silicon · macOS 12+
                </motion.p>
              </div>
            </div>
          </div>
        </div>

        <div className="paper-grid relative border-b border-border px-3 py-12 sm:px-8 sm:py-16 lg:px-16 lg:py-20">
          <div className="pointer-events-none absolute left-4 top-4 font-mono text-[9px] uppercase tracking-[0.14em] text-faint sm:left-8">
            The workbench / 01
          </div>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 28 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
            className="mx-auto max-w-[1040px]"
          >
            <AppDemo />
          </motion.div>
        </div>

        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {FACTS.map(([term, detail], index) => (
            <div
              key={term}
              className={`px-5 py-5 sm:px-8 ${
                index > 0 ? "border-l border-border" : ""
              } ${index === 2 ? "border-t border-border lg:border-t-0" : ""} ${
                index === 3 ? "border-t border-border lg:border-t-0" : ""
              }`}
            >
              <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                {term}
              </dt>
              <dd className="mt-1.5 text-[13px] font-medium text-foreground">
                {detail}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
