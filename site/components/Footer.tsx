"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { DownloadButton } from "./ui/download-button";
import { ButtonLink } from "./ui/button";
import { LogoMark } from "./Logo";
import { EASE_OUT } from "@/lib/ease";
import { DMG, REPO_URL, VERSION } from "@/lib/config";
import { useCopy, useHref } from "@/lib/locale";

const MORE_PRODUCTS = [
  { label: "hoolo.cc", href: "https://hoolo.cc" },
  { label: "clibo.us", href: "https://clibo.us" },
  { label: "citu.work", href: "https://citu.work" },
  { label: "waer.ltd", href: "https://waer.ltd" },
] as const;

export function Footer() {
  const reduce = useReducedMotion();
  const copy = useCopy().footer;
  const href = useHref();
  const links = [
    { label: copy.links.why, href: href("/#principles") },
    { label: copy.links.inside, href: href("/#features") },
    { label: copy.links.agents, href: href("/#mcp") },
    { label: copy.links.docs, href: href("/docs") },
    { label: copy.links.updates, href: href("/updates") },
    { label: copy.links.faq, href: href("/#faq") },
    { label: copy.links.direct, href: DMG },
    { label: copy.links.source, href: REPO_URL },
  ];

  return (
    <footer className="px-3 pb-3 sm:px-6 sm:pb-6">
      <div className="mx-auto w-full max-w-[1440px] overflow-hidden bg-night text-night-ink">
        <div className="relative min-h-[500px] border-b border-night-line">
          <div className="relative overflow-hidden px-5 py-20 sm:px-10 lg:px-16 lg:py-24">
            <Image
              src="/ornata-mark-2026.png"
              alt=""
              width={520}
              height={520}
              aria-hidden="true"
              className="pointer-events-none absolute -right-28 -top-28 w-[420px] invert opacity-[0.035] sm:w-[520px]"
            />
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] uppercase tracking-[0.15em] text-night-muted"
            >
              <LogoMark size={22} />
              <span>{copy.start}</span>
              <span aria-hidden="true" className="h-px w-6 bg-night-line" />
              <span>{copy.madeFor}</span>
            </motion.p>
            <motion.h2
              initial={reduce ? false : { opacity: 0, y: 18, filter: "blur(5px)" }}
              whileInView={
                reduce ? undefined : { opacity: 1, y: 0, filter: "blur(0px)" }
              }
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.06 }}
              className="mt-6 max-w-4xl text-balance font-serif text-[50px] leading-[0.94] tracking-[-0.045em] sm:text-[74px] lg:text-[88px]"
            >
              {copy.title}
            </motion.h2>
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.14 }}
              className="mt-7 max-w-md text-pretty text-[15px] leading-7 text-night-muted"
            >
              {copy.body}
            </motion.p>
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.2 }}
              className="mt-9 flex flex-col gap-3 sm:flex-row"
            >
              <DownloadButton size="lg" tone="night" />
              <ButtonLink
                href={href("/updates")}
                variant="secondary"
                tone="night"
                size="lg"
              >
                {copy.updates}
              </ButtonLink>
            </motion.div>
          </div>
        </div>

        <div>
          <div className="px-5 py-10 sm:px-10 lg:px-16">
            <div className="grid gap-12 md:grid-cols-[1fr_1fr]">
              <nav className="grid grid-cols-2 gap-x-8 gap-y-1">
                {links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="inline-flex min-h-10 items-center text-[12.5px] text-night-muted transition-colors duration-150 hover:text-night-ink"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-night-muted">
                  {copy.more}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5">
                  {MORE_PRODUCTS.map((product) => (
                    <a
                      key={product.href}
                      href={product.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center gap-1 text-[12px] text-night-muted transition-colors duration-150 hover:text-night-ink"
                    >
                      {product.label}
                      <ArrowUpRight size={11} />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-2 border-t border-night-line pt-5 font-mono text-[9px] uppercase tracking-[0.12em] text-night-muted sm:flex-row sm:items-center sm:justify-between">
              <span>{copy.version(VERSION)}</span>
              <span>{copy.tagline}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
