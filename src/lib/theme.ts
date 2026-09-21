import type { Theme } from "@/lib/types";

const STORAGE_KEY = "ornata:theme";

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
