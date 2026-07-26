"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Logo";
import { DownloadButton } from "./ui/download-button";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Why Ornata", href: "/#principles" },
  { label: "Inside the app", href: "/#features" },
  { label: "AssistantPi", href: "/#agent" },
  { label: "Updates", href: "/updates" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] as const }}
      className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/88 backdrop-blur-xl"
    >
      <div className="mx-auto grid h-16 w-full max-w-[1440px] grid-cols-[1fr_auto] items-center px-5 sm:px-8 lg:grid-cols-[220px_1fr_220px] lg:px-10">
        <a
          href="/"
          aria-label="Ornata home"
          className="inline-flex min-h-11 items-center justify-self-start"
        >
          <Wordmark size={24} priority />
        </a>

        <nav className="hidden items-center justify-center gap-1 lg:flex">
          {LINKS.map((link) => {
            const active =
              link.href === "/updates"
                ? pathname === "/updates"
                : pathname === "/" && link.href === "/#principles";
            return (
              <a
                key={link.label}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center px-3 text-[12.5px] transition-colors duration-150",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center justify-self-end">
          <DownloadButton label="Download" size="sm" />
        </div>
      </div>
    </motion.header>
  );
}
