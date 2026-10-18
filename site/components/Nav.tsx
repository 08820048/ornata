"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Logo";
import { DownloadButton } from "./ui/download-button";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Why Ornata", href: "/#principles" },
  { label: "Inside the app", href: "/#features" },
  { label: "Agents", href: "/#mcp" },
  { label: "Docs", href: "/docs" },
  { label: "Updates", href: "/updates" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-paper/85 p-1.5 pl-3 shadow-[0_1px_2px_rgba(22,23,20,0.06),0_16px_40px_-20px_rgba(22,23,20,0.3)] backdrop-blur-xl">
        <a
          href="/"
          aria-label="Ornata home"
          className="inline-flex min-h-9 items-center rounded-full pr-1.5"
        >
          <Wordmark size={22} priority />
        </a>

        <div className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

        <nav className="hidden items-center gap-0.5 md:flex">
          {LINKS.map((link) => {
            const active =
              link.href === "/updates" || link.href === "/docs"
                ? pathname === link.href
                : pathname === "/" && link.href === "/#principles";
            return (
              <a
                key={link.label}
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

        <DownloadButton
          label="Download"
          size="sm"
          className="ml-1 h-9 rounded-full px-4"
        />
      </div>
    </motion.header>
  );
}
