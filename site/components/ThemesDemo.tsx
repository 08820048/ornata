"use client";

import { Check, History, Palette, Plug, Settings } from "lucide-react";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* A theme per mode, switched from the status bar's palette icon. Values mirror
   the real palettes in the app's styles.css (the demo UI stays English). */

interface Theme {
  name: string;
  mode: "Light" | "Dark";
  bg: string;
  panel: string;
  bar: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  caret: string;
  block?: boolean;
  grain?: boolean;
}

const THEMES: Theme[] = [
  { name: "Default", mode: "Light", bg: "#fcfcfd", panel: "#f9f9fa", bar: "#f7f7f8", ink: "#191919", muted: "#6e6e6a", faint: "#a3a39e", line: "#e3e3e0", accent: "#167a6e", caret: "#167a6e" },
  { name: "Paper", mode: "Light", bg: "#fefae9", panel: "#fdf5e5", bar: "#f9f0dc", ink: "#2f2d26", muted: "#6e6a58", faint: "#9a947b", line: "#e7dbb9", accent: "#4f7b5e", caret: "#7db7a4", block: true },
  { name: "Paper Textured", mode: "Light", bg: "#fefae9", panel: "#fdf5e5", bar: "#f9f0dc", ink: "#2f2d26", muted: "#6e6a58", faint: "#9a947b", line: "#e7dbb9", accent: "#4f7b5e", caret: "#7db7a4", block: true, grain: true },
  { name: "Default", mode: "Dark", bg: "#121417", panel: "#17191d", bar: "#1a1c20", ink: "#ebebe8", muted: "#8f8f8a", faint: "#64645f", line: "#292927", accent: "#4cc3b0", caret: "#4cc3b0" },
  { name: "Basalt Bedrock", mode: "Dark", bg: "#040608", panel: "#090c0f", bar: "#0f1318", ink: "#e6e9ed", muted: "#848f9e", faint: "#5b6573", line: "#1c222a", accent: "#9aabbc", caret: "#b8c5d4", block: true },
  { name: "Tokyo Techno", mode: "Dark", bg: "#0f0916", panel: "#17111e", bar: "#1f1a29", ink: "#ededed", muted: "#9a94ad", faint: "#756f8b", line: "#312b3c", accent: "#ebd647", caret: "#ebd647" },
  { name: "Early Ember", mode: "Dark", bg: "#0a100f", panel: "#111816", bar: "#1a231f", ink: "#ededed", muted: "#95a7a4", faint: "#70857f", line: "#2b3633", accent: "#f9af5f", caret: "#f9af5f" },
  { name: "Neon Noir", mode: "Dark", bg: "#0d0f13", panel: "#14161c", bar: "#1a1c24", ink: "#f9fbff", muted: "#98a2b0", faint: "#6c7a8e", line: "#282a36", accent: "#ff79c6", caret: "#ff79c6", block: true },
];

/* The same mottle + grain the app lays over Paper Textured. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Cfilter id='m' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.022' numOctaves='5' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .8 0 0 0 0 .66 0 0 0 0 .4 0 0 0 1.6 -.34'/%3E%3C/filter%3E%3Cfilter id='g' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' seed='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .4 0 0 0 0 .22 0 0 0 1.1 -.4'/%3E%3C/filter%3E%3Crect width='512' height='512' fill='%23f3e6c6'/%3E%3Crect width='512' height='512' filter='url(%23m)'/%3E%3Crect width='512' height='512' filter='url(%23g)'/%3E%3C/svg%3E\")";

const LIGHT = THEMES.filter((t) => t.mode === "Light");
const DARK = THEMES.filter((t) => t.mode === "Dark");

const FILES = ["Q3 Roadmap", "Release notes", "Reading list"];

export function ThemesDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(2);
  const playing = Boolean(inView && !reduce);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setStep((s) => (s + 1) % THEMES.length), 1900);
    return () => window.clearInterval(timer);
  }, [playing]);

  const t = THEMES[step];
  const list = t.mode === "Light" ? LIGHT : DARK;
  const tone = "transition-colors duration-500";
  const soft = (pct: number) => `color-mix(in srgb, ${t.ink} ${pct}%, transparent)`;

  return (
    <div ref={ref}>
      <div className="surface overflow-hidden rounded-[18px] bg-paper p-2">
        <div className="flex h-9 items-center justify-between px-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">Themes</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-faint">
            {t.mode} · {t.name}
          </span>
        </div>

        <div
          className={cn("app-ui relative overflow-hidden rounded-[10px] border border-black/10", tone)}
          style={{ background: t.bg, color: t.ink }}
        >
          <div className="flex min-h-[300px]">
            <div className={cn("hidden w-[30%] shrink-0 border-r px-2 py-3 sm:block", tone)} style={{ background: t.panel, borderColor: t.line }}>
              <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: t.faint }}>
                Notes
              </p>
              {FILES.map((file, i) => (
                <div
                  key={file}
                  className={cn("flex h-7 items-center rounded-md px-2 text-[11.5px]", tone)}
                  style={{ background: i === 1 ? soft(9) : "transparent", color: i === 1 ? t.ink : t.muted }}
                >
                  {file}
                </div>
              ))}
            </div>

            <div className="font-note min-w-0 flex-1 px-6 pt-6">
              <p className="text-[19px] font-[680] leading-tight tracking-[-0.02em]">Release notes</p>
              <p className={cn("mt-3 text-[12.5px] leading-[1.75]", tone)} style={{ color: t.ink, opacity: 0.85 }}>
                A quieter release: faster switching, a calmer sidebar, and a{" "}
                <span className={tone} style={{ color: t.accent }}>
                  link graph
                </span>{" "}
                for the whole vault.
              </p>
              <p className="mt-2 flex items-center gap-2 text-[12.5px] leading-[1.75]">
                <span
                  className={cn("grid size-3 place-items-center rounded-[2px] border", tone)}
                  style={{ borderColor: t.accent, background: t.accent, color: t.bg }}
                >
                  <Check size={9} strokeWidth={3} />
                </span>
                <span style={{ color: t.muted, textDecoration: "line-through" }}>Ship 0.10</span>
              </p>
              <p className="mt-2 flex items-center text-[12.5px] leading-[1.75]">
                <span style={{ color: t.ink, opacity: 0.85 }}>Next, pick a theme</span>
                <span
                  aria-hidden
                  className={cn("ml-px inline-block h-[1.15em] animate-pulse rounded-[2px]", tone)}
                  style={{
                    width: t.block ? 9 : 2,
                    background: t.caret,
                    opacity: t.block ? 0.7 : 1,
                    boxShadow: t.block ? `0 0 2px ${t.caret}` : "none",
                  }}
                />
              </p>
            </div>
          </div>

          <div className={cn("flex h-7 items-center gap-4 border-t px-3 text-[10.5px]", tone)} style={{ background: t.bar, borderColor: t.line, color: t.faint }}>
            <span className="hidden whitespace-nowrap sm:inline">
              <span style={{ color: t.muted }}>⌘K</span> Command palette
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1 tabular-nums">
              <span className="mr-2">Ln 4, Col 21</span>
              <History size={12} strokeWidth={2} />
              <span className="mr-2">186 words</span>
              <span className="grid h-5 w-6 place-items-center">
                <Plug size={13.5} strokeWidth={2} />
              </span>
              <span className={cn("grid h-5 w-6 place-items-center rounded", tone)} style={{ background: soft(9), color: t.muted }}>
                <Palette size={13.5} strokeWidth={2} />
              </span>
              <span className="grid h-5 w-6 place-items-center">
                <Settings size={13.5} strokeWidth={2} />
              </span>
            </div>
          </div>

          {/* The switcher the palette icon opens. */}
          <div
            className={cn("absolute bottom-9 right-2 w-[186px] rounded-md border p-1.5 shadow-lg", tone)}
            style={{ background: t.bar, borderColor: t.line }}
          >
            <div className="grid grid-cols-3 gap-0.5 rounded-md p-0.5" style={{ background: soft(6) }}>
              {["Auto", "Light", "Dark"].map((mode) => {
                const on = mode === t.mode;
                return (
                  <span
                    key={mode}
                    className={cn("grid h-6 place-items-center rounded text-[10.5px] font-medium", tone)}
                    style={{ background: on ? t.ink : "transparent", color: on ? t.bg : t.muted }}
                  >
                    {mode}
                  </span>
                );
              })}
            </div>
            <p className="px-1.5 pb-1 pt-2 text-[9.5px]" style={{ color: t.faint }}>
              {t.mode} theme
            </p>
            {list.map((item) => {
              const on = item.name === t.name;
              return (
                <div
                  key={item.name}
                  className={cn("flex h-6 items-center gap-2 rounded px-1.5 text-[11px]", tone)}
                  style={{ background: on ? soft(7) : "transparent", color: t.ink }}
                >
                  <span className="relative size-3 shrink-0 overflow-hidden rounded-full ring-1" style={{ background: item.bg, ["--tw-ring-color" as string]: t.line }}>
                    <span className="absolute bottom-0 right-0 size-1.5 rounded-tl-full" style={{ background: item.accent }} />
                  </span>
                  <span className="flex-1 truncate">{item.name}</span>
                  {on && <Check size={11} strokeWidth={2} style={{ color: t.muted }} />}
                </div>
              );
            })}
          </div>

          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-multiply transition-opacity duration-500"
            style={{ backgroundImage: GRAIN, backgroundSize: "512px 512px", opacity: t.grain ? 0.5 : 0 }}
          />
        </div>
      </div>
    </div>
  );
}
