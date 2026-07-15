"use client";

import { motion, useReducedMotion } from "motion/react";
import { Grainient } from "./Grainient";
import { MONO } from "./grainient-presets";
import { LogoMark } from "./Logo";
import { TextReveal } from "./ui/text-reveal";
import { ButtonLink } from "./ui/button";
import { DownloadButton } from "./ui/download-button";
import { EASE_OUT } from "@/lib/ease";
import { DMG, VERSION } from "@/lib/config";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Agent", href: "#agent" },
      { label: "Download", href: DMG },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "FAQ", href: "#faq" },
      { label: "Features", href: "#features" },
    ],
  },
];

const MORE_PRODUCTS = [
  { label: "hoolo.cc", href: "https://hoolo.cc" },
  { label: "clibo.us", href: "https://clibo.us" },
  { label: "citu.work", href: "https://citu.work" },
  { label: "waer.ltd", href: "https://waer.ltd" },
];

export function Footer() {
  const reduce = useReducedMotion();
  return (
    <footer className="w-full px-4 pb-12 sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* CTA panel. */}
        <div className="relative overflow-hidden">
          {/*<Grainient className="absolute inset-0" {...MONO} />*/}
          <div className="relative m-3 rounded-[2rem] px-6 py-16 text-center backdrop-blur-sm sm:px-10 sm:py-20">
            <TextReveal
              as="h2"
              text={["Your notes,", "on your disk."]}
              split="word"
              blur={10}
              whileInView
              className="mx-auto max-w-2xl font-serif text-[36px] leading-[1.02] text-foreground sm:text-[56px]"
            />
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 }}
              className="mx-auto mt-5 max-w-md text-pretty text-[15px] leading-7 text-muted-foreground"
            >
              No required account, no proprietary note format, no lock-in. Just
              plain Markdown, with AssistantPi available when you invite it in.
            </motion.p>
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.22 }}
              className="mt-9 flex flex-wrap items-center justify-center gap-3"
            >
              <DownloadButton size="lg" />
              <ButtonLink
                href="#features"
                variant="outline"
                size="lg"
              >
                Explore features
              </ButtonLink>
            </motion.div>
          </div>
        </div>

        {/* Links. */}
        <div className="mt-4 p-8 sm:p-12">
          <div className="flex flex-col justify-between gap-12 md:flex-row">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <LogoMark size={24} />
                <span className="text-[16px] font-semibold tracking-tight text-foreground">
                  Ornata
                </span>
              </div>
              <p className="mt-4 text-[13.5px] leading-6 text-muted-foreground">
                Local-first Markdown notes for macOS, with permission-controlled
                AssistantPi and files that stay yours.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-12 sm:gap-20">
              {COLUMNS.map((col) => (
                <div key={col.title}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
                    {col.title}
                  </p>
                  <ul className="mt-4 flex flex-col gap-2.5">
                    {col.links.map((link) => (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          className="text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-faint sm:flex-row sm:items-center">
            <span>© Ornata · v{VERSION}</span>
            <div className="flex flex-wrap items-center gap-x-5 sm:justify-end">
              <span className="shrink-0">More products</span>
              {MORE_PRODUCTS.map((product) => (
                <a
                  key={product.href}
                  href={product.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center normal-case tracking-normal text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  {product.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
