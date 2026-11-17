import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import type {
  ImageUpload,
  Language,
  DarkPalette,
  LightPalette,
  Theme,
  Typography,
  VaultSnapshot,
} from "@/lib/types";

/** Which of the two windows this JS context is running in. */
export type WindowKind = "main" | "settings" | "print";

export function currentWindowKind(): WindowKind {
  try {
    const label = getCurrentWindow().label;
    if (label === "settings") return "settings";
    if (label === "print") return "print";
    return "main";
  } catch {
    // Browser preview / tests have no Tauri window metadata — behave as main.
    return "main";
  }
}

/** A partial settings update, mirrored across the two windows. */
export interface SettingsPatch {
  theme?: Theme;
  lightPalette?: LightPalette;
  darkPalette?: DarkPalette;
  language?: Language;
  outlineSound?: boolean;
  cursorAnimation?: boolean;
  imageUpload?: ImageUpload;
  typography?: Typography;
  typewriterScroll?: boolean;
  /** Present when the active vault changed; carries the full snapshot. */
  vault?: VaultSnapshot;
}

interface SettingsEvent extends SettingsPatch {
  source: string;
}

const EVENT = "ornata:settings-changed";

// Unique per JS context (webview). Used to ignore our own emits without
// depending on the window label being readable.
const INSTANCE_ID = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2, 10)}`;

/**
 * Broadcast a settings change to the other window. Fire-and-forget: a missing
 * listener (or a browser preview) must never break the local update.
 */
export function broadcastSettings(patch: SettingsPatch) {
  void emit(EVENT, { ...patch, source: INSTANCE_ID }).catch(() => {
    // no other window / not running under Tauri — nothing to sync
  });
}

/**
 * Listen for settings changes made in the other window. Emits from this same
 * window are ignored so updates never ping-pong.
 */
export async function listenSettings(
  handler: (patch: SettingsPatch) => void,
) {
  return listen<SettingsEvent>(EVENT, ({ payload }) => {
    if (payload.source === INSTANCE_ID) return;
    const { source: _source, ...patch } = payload;
    handler(patch);
  });
}
