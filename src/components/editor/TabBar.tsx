import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconCircleX,
  IconLayoutColumns,
  IconLayoutSidebarRightCollapse,
  IconTopologyStar3,
  IconX,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ContextMenu,
  type MenuItem,
  type MenuPosition,
} from "@/components/ui/ContextMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { SPRING_LAYOUT } from "@/lib/ease";
import { closeSplitKeepingFocus } from "@/lib/closePane";
import { openNoteAside } from "@/lib/openAside";
import { neighbourOf } from "@/lib/split";
import { isNoteTab, noteTitle, sameTab, tabKey, tabOfView, viewOfTab } from "@/lib/noteRef";
import type { TabRef } from "@/lib/types";
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
 * Code-editor style tab strip for open notes (and the graph, when open).
 * Active tab is derived from
 * `vault.view`; the strip only owns which tabs exist and their order.
 */
export function TabBar() {
  const tabs = useTabs((s) => s.tabs);
  const view = useVault((s) => s.view);
  const active = view ? tabOfView(view) : null;
  const t = useT();
  const stripRef = useRef<HTMLDivElement>(null);
  const activeKey = active ? tabKey(active) : null;
  const [menu, setMenu] = useState<{
    tab: TabRef;
    position: MenuPosition;
  } | null>(null);

  // A plain mouse wheel reports vertical deltas; remap them to horizontal
  // scrolling so a full tab strip can be panned without a trackpad. Native
  // horizontal gestures (shift+wheel, trackpad) are left untouched.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (strip.scrollWidth <= strip.clientWidth) return;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? strip.clientWidth
            : 1;
      event.preventDefault();
      strip.scrollLeft += event.deltaY * unit;
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, [tabs.length]);

  // Keyboard/click tab switches can land off-screen; nudge the strip just
  // enough to reveal the newly active tab.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !activeKey) return;
    const el = strip.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    );
    if (!el) return;
    const stripRect = strip.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const left = elRect.left - stripRect.left + strip.scrollLeft;
    const right = left + elRect.width;
    if (left < strip.scrollLeft) {
      strip.scrollTo({ left, behavior: "smooth" });
    } else if (right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: right - strip.clientWidth, behavior: "smooth" });
    }
  }, [activeKey]);

  if (tabs.length === 0) return null;

  return (
    <>
      {/* layoutRoot scopes the sliding active-tab fill to this strip so the
          horizontal scroll offset can't smear its projection. */}
      <motion.div
        ref={stripRef}
        layoutRoot
        role="tablist"
        className="no-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto overscroll-x-contain"
      >
        {tabs.map((tab, index) => (
          <Tab
            key={tabKey(tab)}
            tab={tab}
            active={active ? sameTab(tab, active) : false}
            focusable={(active ? sameTab(tab, active) : false) || (!active && index === 0)}
            onContextMenu={(position) => setMenu({ tab, position })}
          />
        ))}
      </motion.div>
      {menu && (
        <ContextMenu
          position={menu.position}
          items={tabMenuItems(menu.tab, tabs, t)}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

/** Close `tab`; if it was the active one, activate its neighbor. */
export function closeTab(tab: TabRef) {
  const { tabs, close } = useTabs.getState();
  const vault = useVault.getState();
  const wasActive = vault.view !== null && sameTab(tabOfView(vault.view), tab);
  // Closing a pane's tab keeps focus inside the split.
  const split = useTabs.getState().split;
  const paneNext = wasActive && split ? neighbourOf(split, tab) : null;
  const next = wasActive ? (paneNext ?? nextAfterClose(tabs, tab)) : null;
  close(tab);
  if (wasActive) {
    vault.setView(next ? viewOfTab(next) : null);
  }
}

function closeTabsAround(kept: TabRef, scope: BulkCloseScope) {
  const tabsState = useTabs.getState();
  const closing = tabsForBulkClose(tabsState.tabs, kept, scope);
  if (closing.length === 0) return;

  const vault = useVault.getState();
  const active = vault.view ? tabOfView(vault.view) : null;
  tabsState.closeMany(closing);
  if (active && closing.some((tab) => sameTab(tab, active))) {
    // The context-clicked tab always survives a left/right/others operation.
    vault.setView(viewOfTab(kept));
  }
}

function tabMenuItems(
  target: TabRef,
  tabs: TabRef[],
  t: ReturnType<typeof useT>,
): MenuItem[] {
  const index = tabs.findIndex((tab) => sameTab(tab, target));
  const items: MenuItem[] = [];
  const focused = useVault.getState().view;
  if (isNoteTab(target) && !(focused && sameTab(tabOfView(focused), target))) {
    items.push({
      label: t("split.openAside"),
      icon: IconLayoutColumns,
      onSelect: () => openNoteAside(target),
    });
  }
  if (useTabs.getState().split) {
    items.push({
      label: t("split.close"),
      icon: IconLayoutSidebarRightCollapse,
      onSelect: () => closeSplitKeepingFocus(),
    });
  }
  items.push({
    label: t("editor.closeTabMenu"),
    icon: IconX,
    onSelect: () => closeTab(target),
  });
  if (tabs.length > 1) {
    items.push({
      label: t("editor.closeOtherTabs"),
      icon: IconCircleX,
      onSelect: () => closeTabsAround(target, "others"),
    });
  }
  if (index > 0) {
    items.push({
      label: t("editor.closeTabsToLeft"),
      icon: IconArrowBarToLeft,
      onSelect: () => closeTabsAround(target, "left"),
    });
  }
  if (index >= 0 && index < tabs.length - 1) {
    items.push({
      label: t("editor.closeTabsToRight"),
      icon: IconArrowBarToRight,
      onSelect: () => closeTabsAround(target, "right"),
    });
  }
  return items;
}

function Tab({
  tab,
  active,
  focusable,
  onContextMenu,
}: {
  tab: TabRef;
  active: boolean;
  focusable: boolean;
  onContextMenu: (position: MenuPosition) => void;
}) {
  const setView = useVault((s) => s.setView);
  const t = useT();
  const title = isNoteTab(tab) ? noteTitle(tab) : t("graph.title");

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={focusable ? 0 : -1}
      title={tab.kind === "vault" ? tab.rel : tab.kind === "external" ? tab.path : title}
      className={cx(
        "group/tab relative flex h-full min-w-0 max-w-[180px] shrink-0 cursor-pointer select-none items-center gap-1 pl-3 pr-1.5 text-[12.5px] transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
        active ? "text-ink" : "text-muted hover:text-ink",
      )}
      onClick={() => {
        if (!active) setView(viewOfTab(tab));
      }}
      onAuxClick={(event) => {
        // middle-click closes, like every code editor
        if (event.button === 1) closeTab(tab);
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
          setView(viewOfTab(tab));
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
      {!isNoteTab(tab) && (
        <IconTopologyStar3 size={12} stroke={2} className="relative z-10 shrink-0 text-faint" />
      )}
      <span className="relative z-10 truncate">{title}</span>
      <Tooltip label={t("editor.closeTab")} side="bottom">
        <button
          type="button"
          aria-label={t("editor.closeNote", { title })}
          className={cx(
            "relative z-10 grid h-5 w-5 shrink-0 place-items-center rounded transition-opacity duration-75 hover:bg-hover",
            active
              ? "opacity-60 hover:opacity-100"
              : "opacity-0 group-hover/tab:opacity-60 group-hover/tab:hover:opacity-100",
          )}
          onClick={(event) => {
            event.stopPropagation();
            closeTab(tab);
          }}
        >
          <IconX size={11} stroke={2} />
        </button>
      </Tooltip>
    </div>
  );
}
