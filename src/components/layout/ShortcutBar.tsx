import {
  IconSettings,
} from "@tabler/icons-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { ipc } from "@/lib/ipc";
import { keyLabel } from "@/lib/utils";
import { barShortcuts, type BarContext } from "@/lib/shortcuts";
import { useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { KeyCap } from "./KeyCap";
import { McpIndicator } from "./McpIndicator";

/**
 * The status bar along the bottom: the shortcuts that matter for the current
 * view on the left (hideable), the MCP plug on the right. Focus mode removes
 * the whole strip.
 */
export function ShortcutBar() {
  const t = useT();
  const hintsHidden = useUi((s) => s.shortcutBarHidden);
  const focusMode = useUi((s) => s.focusMode);
  const view = useVault((s) => s.view);
  if (focusMode) return null;

  const context: BarContext = !view ? "empty" : view.type === "graph" ? "graph" : "note";

  return (
    <footer
      aria-label={t("settings.shortcuts")}
      className="flex h-7 shrink-0 items-center gap-4 border-t border-line-soft bg-statusbar pl-3 pr-2 text-[10.5px] text-muted"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden whitespace-nowrap">
        {!hintsHidden &&
          barShortcuts(context).map((shortcut) => (
            <span key={shortcut.label} className="flex items-center gap-1.5">
              <span className="flex items-center gap-[3px]">
                {shortcut.keys.map((key) => (
                  <KeyCap key={key} value={key} />
                ))}
              </span>
              {t(shortcut.label)}
            </span>
          ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <McpIndicator />
        <Tooltip label={`${t("common.settings")} ${keyLabel("⌘,")}`} side="top">
          <button
            type="button"
            aria-label={t("common.settings")}
            onClick={() => void ipc.openSettingsWindow()}
            className="grid h-5 w-6 cursor-pointer place-items-center rounded text-faint transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-muted active:scale-[0.96]"
          >
            <IconSettings size={13.5} stroke={2} />
          </button>
        </Tooltip>
      </div>
    </footer>
  );
}
