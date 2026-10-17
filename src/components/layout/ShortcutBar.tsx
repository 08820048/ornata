import { barShortcuts, type BarContext } from "@/lib/shortcuts";
import { useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";

/** Bottom strip of the shortcuts that matter for the current view. */
export function ShortcutBar() {
  const t = useT();
  const hidden = useUi((s) => s.shortcutBarHidden || s.focusMode);
  const view = useVault((s) => s.view);
  if (hidden) return null;

  const context: BarContext = !view ? "empty" : view.type === "graph" ? "graph" : "note";

  return (
    <footer
      aria-label={t("settings.shortcuts")}
      className="flex h-7 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-line-soft bg-bg px-3 text-[10.5px] text-faint"
    >
      {barShortcuts(context).map((shortcut) => (
        <span key={shortcut.label} className="flex items-center gap-1.5">
          <kbd className="font-mono text-[10px] text-muted">{shortcut.keys.join("")}</kbd>
          {t(shortcut.label)}
        </span>
      ))}
    </footer>
  );
}
