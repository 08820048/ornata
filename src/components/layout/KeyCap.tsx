import {
  IconArrowBigUp,
  IconArrowDown,
  IconArrowUp,
  IconCommand,
  IconOption,
} from "@tabler/icons-react";
import type { Icon as TablerIcon } from "@tabler/icons-react";

const ICONS: Record<string, TablerIcon> = {
  "⌘": IconCommand,
  "⇧": IconArrowBigUp,
  "⌥": IconOption,
  "↑": IconArrowUp,
  "↓": IconArrowDown,
};

/** One key of a shortcut: modifier symbols become icons instead of font glyphs. */
export function KeyCap({ value }: { value: string }) {
  const Icon = ICONS[value];
  return (
    <kbd className="inline-grid h-[17px] min-w-[17px] place-items-center rounded-[4px] bg-sunken px-1 font-sans text-[10.5px] font-medium leading-none text-muted">
      {Icon ? <Icon size={11} stroke={2} aria-label={value} /> : value}
    </kbd>
  );
}
