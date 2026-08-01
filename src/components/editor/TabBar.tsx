import { X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import {
  ContextMenu,
  type MenuItem,
  type MenuPosition,
} from "@/components/ui/ContextMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { SPRING_LAYOUT } from "@/lib/ease";
import { noteKey, noteTitle, sameNote } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";
import { cx } from "@/lib/utils";
import {
  nextAfterClose,
  tabsForBulkClose,
  type BulkCloseScope,
  useTabs,
} from "@/stores/tabs";
import { useVault } from "@/stores/vault";
import { useT } from "@/stores/locale";

/**
 * Code-editor style tab strip for open notes. Active tab is derived from
 * `vault.view`; the strip only owns which tabs exist and their order.
 */
export function TabBar() {
  const tabs = useTabs((s) => s.tabs);
  const view = useVault((s) => s.view);
  const active = view?.type === "note" ? view.note : null;
  const t = useT();
  const [menu, setMenu] = useState<{
    note: NoteRef;
    position: MenuPosition;
  } | null>(null);

  if (tabs.length === 0) return null;

  return (
    <>
      {/* layoutRoot scopes the sliding active-tab fill to this strip so the
          horizontal scroll offset can't smear its projection. */}
      <motion.div
        layoutRoot
        role="tablist"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]"
      >
        {tabs.map((note, index) => (
          <Tab
            key={noteKey(note)}
            note={note}
            active={active ? sameNote(note, active) : false}
            focusable={(active ? sameNote(note, active) : false) || (!active && index === 0)}
            onContextMenu={(position) => setMenu({ note, position })}
          />
        ))}
      </motion.div>
      {menu && (
        <ContextMenu
          position={menu.position}
          items={tabMenuItems(menu.note, tabs, t)}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

/** Close `rel`; if it was the active note, activate its neighbor. */
export function closeTab(note: NoteRef) {
  const { tabs, close } = useTabs.getState();
  const vault = useVault.getState();
  const wasActive =
    vault.view?.type === "note" && sameNote(vault.view.note, note);
  const next = wasActive ? nextAfterClose(tabs, note) : null;
  close(note);
  if (wasActive) {
    vault.setView(next ? { type: "note", note: next } : null);
  }
}

function closeTabsAround(note: NoteRef, scope: BulkCloseScope) {
  const tabsState = useTabs.getState();
  const closing = tabsForBulkClose(tabsState.tabs, note, scope);
  if (closing.length === 0) return;

  const vault = useVault.getState();
  const active = vault.view?.type === "note" ? vault.view.note : null;
  tabsState.closeMany(closing);
  if (active && closing.some((tab) => sameNote(tab, active))) {
    // The context-clicked tab always survives a left/right/others operation.
    vault.setView({ type: "note", note });
  }
}

function tabMenuItems(
  note: NoteRef,
  tabs: NoteRef[],
  t: ReturnType<typeof useT>,
): MenuItem[] {
  const index = tabs.findIndex((tab) => sameNote(tab, note));
  const items: MenuItem[] = [
    { label: t("editor.closeTabMenu"), onSelect: () => closeTab(note) },
  ];
  if (tabs.length > 1) {
    items.push({
      label: t("editor.closeOtherTabs"),
      onSelect: () => closeTabsAround(note, "others"),
    });
  }
  if (index > 0) {
    items.push({
      label: t("editor.closeTabsToLeft"),
      onSelect: () => closeTabsAround(note, "left"),
    });
  }
  if (index >= 0 && index < tabs.length - 1) {
    items.push({
      label: t("editor.closeTabsToRight"),
      onSelect: () => closeTabsAround(note, "right"),
    });
  }
  return items;
}

function Tab({
  note,
  active,
  focusable,
  onContextMenu,
}: {
  note: NoteRef;
  active: boolean;
  focusable: boolean;
  onContextMenu: (position: MenuPosition) => void;
}) {
  const setView = useVault((s) => s.setView);
  const t = useT();

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={focusable ? 0 : -1}
      title={note.kind === "vault" ? note.rel : note.path}
      className={cx(
        "group/tab relative flex h-full min-w-0 max-w-[180px] shrink-0 cursor-pointer select-none items-center gap-1 pl-3 pr-1.5 text-[12.5px] transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
        active ? "text-ink" : "text-muted hover:text-ink",
      )}
      onClick={() => {
        if (!active) setView({ type: "note", note });
      }}
      onAuxClick={(event) => {
        // middle-click closes, like every code editor
        if (event.button === 1) closeTab(note);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        // ContextMenu installs a window-level contextmenu listener to dismiss
        // itself. Keep this opening event from reaching that listener and
        // immediately closing the newly mounted menu.
        event.stopPropagation();
        onContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        const tabs = Array.from(
          event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
            '[role="tab"]',
          ) ?? [],
        );
        const index = tabs.indexOf(event.currentTarget);
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") {
          next = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setView({ type: "note", note });
          return;
        } else return;
        event.preventDefault();
        tabs[next]?.focus();
        tabs[next]?.click();
      }}
    >
      {/* Active fill glides between tabs via shared layout; inactive rows get
          a plain hover tint that doesn't participate in the projection. */}
      {active ? (
        <motion.div
          layoutId="tab-active-fill"
          transition={SPRING_LAYOUT}
          className="absolute inset-0 bg-bg"
        />
      ) : (
        <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-100 group-hover/tab:bg-hover/60 group-hover/tab:opacity-100" />
      )}
      <span className="relative z-10 truncate">{noteTitle(note)}</span>
      <Tooltip label={t("editor.closeTab")} side="bottom">
        <button
          type="button"
          aria-label={t("editor.closeNote", { title: noteTitle(note) })}
          className={cx(
            "relative z-10 grid h-5 w-5 shrink-0 place-items-center rounded transition-opacity duration-75 hover:bg-hover",
            active
              ? "opacity-60 hover:opacity-100"
              : "opacity-0 group-hover/tab:opacity-60 group-hover/tab:hover:opacity-100",
          )}
          onClick={(event) => {
            event.stopPropagation();
            closeTab(note);
          }}
        >
          <X size={11} strokeWidth={2} />
        </button>
      </Tooltip>
    </div>
  );
}
