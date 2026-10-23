import type { Palette, Theme } from "@/lib/types";

const STORAGE_KEY = "ornata:theme";
const PALETTE_KEY = "ornata:palette";

/**
 * Apply a theme to the document root and mirror it to localStorage. The
 * mirror lets either window paint the correct theme synchronously on load,
 * before the async config read finishes (avoids a light flash in dark mode).
 */
export function applyTheme(theme: Theme) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const dark = theme === "dark" || (theme === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private mode / storage disabled — the in-memory theme still applies
  }
}

/** Apply a theme to the document root WITHOUT mirroring it to localStorage —
 *  for auxiliary windows (print) whose temporary theme must not leak into the
 *  main window's next first paint. */
export function renderTheme(theme: Theme) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const dark = theme === "dark" || (theme === "system" && media.matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Last applied theme, for a flash-free first paint. */
export function cachedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    // ignore
  }
  return "system";
}

/** Apply a palette to the document root (`data-palette`, absent for the
 *  default) and mirror it to localStorage for a flash-free first paint. */
export function applyPalette(palette: Palette) {
  if (palette === "default") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = palette;
  try {
    localStorage.setItem(PALETTE_KEY, palette);
  } catch {
    // storage disabled — the in-memory palette still applies
  }
}

/** Last applied palette, for a flash-free first paint. */
export function cachedPalette(): Palette {
  try {
    if (localStorage.getItem(PALETTE_KEY) === "paper-basalt") return "paper-basalt";
  } catch {
    // ignore
  }
  return "default";
}
