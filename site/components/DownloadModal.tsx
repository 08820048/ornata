"use client";

import { Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { buttonClass } from "./ui/button";
import { EASE_OUT } from "@/lib/ease";
import { useCopy } from "@/lib/locale";

export const DOWNLOAD_EVENT = "ornata:download";

export function DownloadModal() {
  const copy = useCopy().downloadModal;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onDownload = () => setOpen(true);
    window.addEventListener(DOWNLOAD_EVENT, onDownload);
    return () => window.removeEventListener(DOWNLOAD_EVENT, onDownload);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label={copy.close}
            className="absolute inset-0 bg-night/45 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="surface relative w-full max-w-md overflow-hidden rounded-[18px] bg-paper p-2"
          >
            <div className="rounded-[10px] bg-card p-6 sm:p-7">
              <button
                type="button"
                aria-label={copy.close}
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 grid size-10 place-items-center rounded-lg text-faint transition-[background-color,color,transform] duration-150 hover:bg-active hover:text-foreground active:scale-[0.96]"
              >
                <X size={15} />
              </button>
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-faint">
                {copy.started}
              </p>
              <h3
                id="download-title"
                className="mt-3 max-w-xs text-balance font-serif text-[32px] leading-[1] tracking-[-0.03em] text-foreground"
              >
                {copy.title}
              </h3>
              <p className="mt-4 text-pretty text-[13.5px] leading-6 text-muted-foreground">
                {copy.note}
              </p>

              <ol className="mt-6 space-y-2">
                {copy.steps.map((step, index) => (
                  <li
                    key={step}
                    className="flex min-h-11 items-center gap-3 rounded-lg bg-paper px-3 text-[12.5px] text-fg-soft"
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className={buttonClass({
                  variant: "ink",
                  size: "md",
                  className: "mt-6 w-full active:scale-[0.97]",
                })}
              >
                <Check size={14} />
                {copy.done}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
