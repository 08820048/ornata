import type { DarkPalette, LightPalette, Theme } from "@/lib/types";

const STORAGE_KEY = "ornata:theme";
const PALETTES_KEY = "ornata:palettes";

export interface Palettes {
  light: LightPalette;
  dark: DarkPalette;
}

let palettes: Palettes = { light: "default", dark: "default" };
let isDark = false;

/** Put the palette for the current mode on <html> (`data-palette`, absent for
 *  the default one). */
function paintPalette() {
  const id = isDark ? palettes.dark : palettes.light;
  if (id === "default") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = id;
}

let titleBarTheme: Theme | undefined;

/** Windows draws a native title bar above the page (macOS hides it under the
 *  overlay), and that bar follows the system mode, not the app's: choosing
 *  Dark with Windows in light mode left a white bar over a dark window. Tell
 *  the window which mode it is in; "system" hands it back to Windows. */
function paintTitleBar(theme: Theme) {
  if (theme === titleBarTheme || !navigator.platform.toLowerCase().startsWith("win")) return;
  titleBarTheme = theme;
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme === "system" ? null : theme))
    .catch(() => {
      titleBarTheme = undefined;
    });
}

/**
 * Apply a theme to the document root and mirror it to localStorage. The
 * mirror lets either window paint the correct theme synchronously on load,
 * before the async config read finishes (avoids a light flash in dark mode).
 */
export function applyTheme(theme: Theme) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const dark = theme === "dark" || (theme === "system" && media.matches);
  isDark = dark;
  document.documentElement.classList.toggle("dark", dark);
  paintPalette();
  paintTitleBar(theme);
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
  // Printed/exported pages stay on the neutral palette.
  delete document.documentElement.dataset.palette;
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

/** Choose the light- and dark-mode palettes; the one for the current mode is
 *  painted now, and both are mirrored to localStorage for first paint. */
export function applyPalettes(next: Palettes) {
  palettes = next;
  paintPalette();
  try {
    localStorage.setItem(PALETTES_KEY, JSON.stringify(next));
  } catch {
    // storage disabled — the in-memory palettes still apply
  }
}

/** Last applied palettes, for a flash-free first paint. */
export function cachedPalettes(): Palettes {
  try {
    const raw = localStorage.getItem(PALETTES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Palettes>;
      return {
        light: parsed.light ?? "default",
        dark: parsed.dark ?? "default",
      };
    }
  } catch {
    // ignore
  }
  return { light: "default", dark: "default" };
}
