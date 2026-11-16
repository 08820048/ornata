"use client";

import { type HTMLMotionProps, motion, useReducedMotion } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { SPRING_PRESS } from "@/lib/ease";
import { useHoverCapable } from "@/lib/hooks/use-hover-capable";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "ink" | "secondary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonTone = "light" | "night";

// One solid face plus one quiet neighbour — the way a download pair reads:
// generous corners, a semibold label, and a hairline edge doing the work
// instead of a glow. The solid sits at the far end of the surface's tonal
// range: ink on paper, paper on the night section.
const VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-face-ink font-semibold text-primary-foreground",
  ink: "btn-face-ink font-semibold text-primary-foreground",
  secondary: "btn-quiet font-medium text-fg-soft",
  outline: "border border-border-strong font-medium text-foreground hover:bg-hover",
  ghost: "font-medium text-muted-foreground hover:text-foreground",
};

const NIGHT: Record<ButtonVariant, string | undefined> = {
  primary: "btn-face-light btn-halo-night font-semibold text-night",
  ink: "btn-face-ink font-semibold text-primary-foreground",
  secondary: "btn-quiet-night font-medium text-night-ink",
  outline: "border border-night-line font-medium text-night-ink hover:bg-night-line",
  ghost: "font-medium text-night-muted hover:text-night-ink",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 gap-2 rounded-[10px] px-3.5 text-[12.5px]",
  md: "h-11 gap-2.5 rounded-[12px] px-5 text-[13.5px]",
  lg: "h-[50px] gap-2.5 rounded-[14px] px-[22px] text-[14.5px]",
};

const BASE =
  "inline-flex select-none items-center justify-center whitespace-nowrap tracking-[-0.005em] transition-[background-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 [&>svg]:shrink-0";

export function buttonClass({
  variant = "primary",
  size = "md",
  tone = "light",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  className?: string;
} = {}) {
  return cn(BASE, tone === "night" ? NIGHT[variant] : VARIANT[variant], SIZE[size], className);
}

export interface ButtonLinkProps extends Omit<HTMLMotionProps<"a">, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  /** Small trailing label, set quieter than the main one. */
  meta?: string;
  children?: ReactNode;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  function ButtonLink(
    { variant = "primary", size = "md", tone = "light", meta, className, children, ...rest },
    ref,
  ) {
    const reduce = useReducedMotion();
    const canHover = useHoverCapable();
    return (
      <motion.a
        ref={ref}
        className={buttonClass({ variant, size, tone, className })}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        whileHover={reduce || !canHover ? undefined : { scale: 1.012, y: -1 }}
        transition={SPRING_PRESS}
        {...rest}
      >
        {children}
        {meta ? (
          <span className={cn("ml-0.5 text-[11px] font-normal tracking-normal", tone === "night" ? "text-night-muted" : "text-faint")}>
            {meta}
          </span>
        ) : null}
      </motion.a>
    );
  },
);
