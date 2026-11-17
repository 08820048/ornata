import type { Typography } from "@/lib/types";

/** What the note page looked like before it could be changed. */
export const DEFAULT_TYPOGRAPHY: Typography = {
  fontSize: "normal",
  lineWidth: "wide",
  lineHeight: "normal",
};

export const FONT_SIZES = { small: 14, normal: 15, large: 16, larger: 18 } as const;
/** Width of the note page, its side padding included. */
export const LINE_WIDTHS = { narrow: 760, medium: 960, wide: 1200 } as const;
export const LINE_HEIGHTS = { compact: 1.6, normal: 1.8, loose: 2 } as const;

const STORAGE_KEY = "ornata:typography";

/** Fill in anything missing or unknown with the default. */
export function normalizeTypography(value: unknown): Typography {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const pick = <T extends string>(key: keyof Typography, known: Record<T, number>): T =>
    typeof raw[key] === "string" && (raw[key] as string) in known
      ? (raw[key] as T)
      : (DEFAULT_TYPOGRAPHY[key] as T);
  return {
    fontSize: pick("fontSize", FONT_SIZES),
    lineWidth: pick("lineWidth", LINE_WIDTHS),
    lineHeight: pick("lineHeight", LINE_HEIGHTS),
  };
}

/** The custom properties `styles.css` reads for the note page. */
export function typographyVars(typography: Typography): Record<string, string> {
  return {
    "--note-size": `${FONT_SIZES[typography.fontSize]}px`,
    "--note-width": `${LINE_WIDTHS[typography.lineWidth]}px`,
    "--note-leading": String(LINE_HEIGHTS[typography.lineHeight]),
  };
}

/** Put the typography on <html> and remember it for the next first paint. */
export function applyTypography(typography: Typography) {
  const style = document.documentElement.style;
  for (const [name, value] of Object.entries(typographyVars(typography))) {
    style.setProperty(name, value);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(typography));
  } catch {
    // storage disabled — the in-memory values still apply
  }
}

export function cachedTypography(): Typography {
  try {
    return normalizeTypography(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}
