import { barShortcuts, type BarContext } from "@/lib/shortcuts";
import { isMac } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
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
      className="flex h-7 shrink-0 items-center gap-4 border-t border-line-soft bg-bg pl-3 pr-2 text-[10.5px] text-faint"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden whitespace-nowrap">
        {!hintsHidden &&
          barShortcuts(context).map((shortcut) => (
            <span key={shortcut.label} className="flex items-center gap-1.5">
              <kbd className="font-mono text-[10px] text-muted">{shortcut.keys.join(isMac() ? "" : "+")}</kbd>
              {t(shortcut.label)}
            </span>
          ))}
      </div>
      <McpIndicator />
    </footer>
  );
}
