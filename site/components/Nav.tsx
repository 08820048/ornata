"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Logo";
import { DownloadButton } from "./ui/download-button";
import { cn } from "@/lib/utils";
import { useCopy, useHref, useLocale } from "@/lib/locale";

export function Nav() {
  const pathname = usePathname();
  const copy = useCopy().nav;
  const locale = useLocale();
  const href = useHref();
  const links = [
    { label: copy.why, href: href("/#principles"), key: "/#principles" },
    { label: copy.inside, href: href("/#features"), key: "/#features" },
    { label: copy.agents, href: href("/#mcp"), key: "/#mcp" },
    { label: copy.docs, href: href("/docs"), key: "/docs" },
    { label: copy.updates, href: href("/updates"), key: "/updates" },
  ];
  // The same page in the other language.
  const bare = locale === "zh" ? pathname.replace(/^\/zh/, "") || "/" : pathname;
  const otherHref = locale === "zh" ? bare : bare === "/" ? "/zh" : `/zh${bare}`;
  const here = pathname.replace(/^\/zh/, "") || "/";

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-paper/85 p-1.5 pl-3 shadow-[0_1px_2px_rgba(22,23,20,0.06),0_16px_40px_-20px_rgba(22,23,20,0.3)] backdrop-blur-xl">
        <a
          href={href("/")}
          aria-label="Ornata"
          className="inline-flex min-h-9 items-center rounded-full pr-1.5"
        >
          <Wordmark size={22} priority />
        </a>

        <div className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

        <nav className="hidden items-center gap-0.5 md:flex">
          {links.map((link) => {
            const active =
              link.key === "/updates" || link.key === "/docs"
                ? here === link.key
                : here === "/" && link.key === "/#principles";
            return (
              <a
                key={link.key}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full px-3 text-[12.5px] transition-colors duration-150",
                  active
                    ? "bg-active text-foreground"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground",
                )}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <a
          href={otherHref}
          hrefLang={locale === "zh" ? "en" : "zh-CN"}
          aria-label={copy.switchTo}
          className="inline-flex min-h-9 items-center rounded-full px-2.5 font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-hover hover:text-foreground"
        >
          {copy.langLabel}
        </a>

        <DownloadButton
          label={copy.download}
          size="sm"
          className="ml-1 h-9 rounded-full px-4"
        />
      </div>
    </motion.header>
  );
}
