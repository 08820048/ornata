import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The small mono line above a section title: an optional "01 / 10" index, a
 * short rule, then the label. It replaces the 220px left rail the sections
 * used to carry, which held only this text and took width from the content.
 */
export function Kicker({
  index,
  children,
  className,
}: {
  index?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint",
        className,
      )}
    >
      {index ? <span className="tabular-nums">{index}</span> : null}
      {index && children ? <span aria-hidden="true" className="h-px w-6 bg-border" /> : null}
      {children ? <span>{children}</span> : null}
    </p>
  );
}
