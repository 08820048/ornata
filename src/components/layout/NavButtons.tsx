import {
  IconArrowLeft,
  IconArrowRight,
} from "@tabler/icons-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { canStep } from "@/lib/split";
import { goBack, goForward } from "@/lib/navigate";
import type { TabRef } from "@/lib/types";
import { cx, keyLabel } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useTabs } from "@/stores/tabs";

/** Back / forward through the notes this pane has shown. Each pane keeps its
 *  own trail, so these arrows only move the pane they sit in. */
export function NavButtons({ tab }: { tab: TabRef | null }) {
  const t = useT();
  // Primitive selectors: a fresh object here would re-render forever.
  const canBack = useTabs((s) => (tab ? canStep(s, tab, "back") : false));
  const canForward = useTabs((s) => (tab ? canStep(s, tab, "forward") : false));

  return (
    <div className="mr-2 flex shrink-0 items-center gap-0.5">
      <NavButton label={`${t("settings.shortcut.back")} ${keyLabel("⌘[")}`} disabled={!canBack} onClick={goBack}>
        <IconArrowLeft size={15} stroke={1.9} />
      </NavButton>
      <NavButton label={`${t("settings.shortcut.forward")} ${keyLabel("⌘]")}`} disabled={!canForward} onClick={goForward}>
        <IconArrowRight size={15} stroke={1.9} />
      </NavButton>
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cx(
          "grid h-7 w-7 place-items-center rounded-md text-muted transition-[color,background-color,transform] duration-100 active:scale-[0.96]",
          disabled ? "pointer-events-none opacity-30" : "hover:bg-hover hover:text-ink",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}
