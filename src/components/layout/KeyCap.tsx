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

/** A whole shortcut as one pill — `⌘` `K` side by side — for dense strips. */
export function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <kbd className="inline-flex h-[18px] items-center gap-[3px] rounded-[5px] bg-sunken px-1.5 font-sans text-[10.5px] font-medium leading-none text-ink">
      {keys.map((key, index) => {
        const Icon = ICONS[key];
        return Icon ? <Icon key={index} size={11} stroke={2} aria-label={key} /> : <span key={index}>{key}</span>;
      })}
    </kbd>
  );
}
