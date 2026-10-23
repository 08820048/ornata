import type { MessageKey } from "@/lib/i18n";
import type { DarkPalette, LightPalette } from "@/lib/types";

/** What a palette card in Settings previews: page, sidebar, text, accent.
 *  Literal values on purpose — each card shows a palette other than the one
 *  currently applied; keep them in step with the blocks in `styles.css`. */
export interface PaletteSwatch {
  bg: string;
  panel: string;
  ink: string;
  accent: string;
}

export interface PaletteInfo<T extends string> {
  id: T;
  label: MessageKey;
  swatch: PaletteSwatch;
}

export const LIGHT_PALETTES: ReadonlyArray<PaletteInfo<LightPalette>> = [
  {
    id: "default",
    label: "palette.default",
    swatch: { bg: "#fcfcfd", panel: "#f9f9fa", ink: "#191919", accent: "#167a6e" },
  },
  {
    id: "paper",
    label: "palette.paper",
    swatch: { bg: "#fefae9", panel: "#fdf5e5", ink: "#2f2d26", accent: "#4f7b5e" },
  },
  {
    id: "paper-textured",
    label: "palette.paperTextured",
    swatch: { bg: "#f1e7c9", panel: "#efe3c4", ink: "#2f2d26", accent: "#4f7b5e" },
  },
];

export const DARK_PALETTES: ReadonlyArray<PaletteInfo<DarkPalette>> = [
  {
    id: "default",
    label: "palette.default",
    swatch: { bg: "#121417", panel: "#17191d", ink: "#ebebe8", accent: "#4cc3b0" },
  },
  {
    id: "basalt",
    label: "palette.basalt",
    swatch: { bg: "#040608", panel: "#090c0f", ink: "#e6e9ed", accent: "#9aabbc" },
  },
  {
    id: "tokyo-techno",
    label: "palette.tokyoTechno",
    swatch: { bg: "#0f0916", panel: "#17111e", ink: "#ededed", accent: "#ebd647" },
  },
  {
    id: "early-ember",
    label: "palette.earlyEmber",
    swatch: { bg: "#0a100f", panel: "#111816", ink: "#ededed", accent: "#f9af5f" },
  },
  {
    id: "neon-noir",
    label: "palette.neonNoir",
    swatch: { bg: "#0d0f13", panel: "#14161c", ink: "#f9fbff", accent: "#ff79c6" },
  },
];
