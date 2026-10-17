import { ArrowLeft, ArrowRight } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { canGoBack, canGoForward } from "@/lib/navHistory";
import { goBack, goForward } from "@/lib/navigate";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useNav } from "@/stores/nav";

/** Back / forward through the notes visited in this session. */
export function NavButtons() {
  const t = useT();
  const entries = useNav((s) => s.entries);
  const index = useNav((s) => s.index);
  const history = { entries, index };

  return (
    <div className="mr-2 flex shrink-0 items-center gap-0.5">
      <NavButton
        label={`${t("settings.shortcut.back")} ⌘[`}
        disabled={!canGoBack(history)}
        onClick={goBack}
      >
        <ArrowLeft size={15} strokeWidth={1.9} />
      </NavButton>
      <NavButton
        label={`${t("settings.shortcut.forward")} ⌘]`}
        disabled={!canGoForward(history)}
        onClick={goForward}
      >
        <ArrowRight size={15} strokeWidth={1.9} />
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
          disabled
            ? "pointer-events-none opacity-30"
            : "hover:bg-hover hover:text-ink",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}
