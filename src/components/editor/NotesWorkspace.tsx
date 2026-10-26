import { useRef } from "react";
import { NoteEditor } from "./NoteEditor";
import { GraphView } from "@/components/graph/GraphView";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { PaneHeader } from "@/components/layout/PaneHeader";
import { isNoteTab, sameTab, tabKey, tabOfView, viewOfTab } from "@/lib/noteRef";
import { MIN_PANE_PX, resizeDivider } from "@/lib/split";
import type { TabRef } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useTabs } from "@/stores/tabs";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";

/**
 * One live pane per open tab — an editor per note, the graph for the graph
 * tab. Inactive panes stay mounted and retain
 * layout behind visibility:hidden, so switching tabs is a paint-only class
 * toggle — no parse, remount, or full-document reflow. The whole workspace
 * likewise just hides (not unmounts) when no note is active. The tab strip
 * itself lives in the top bar (see AppShell).
 *
 * With a split open, the split notes sit side by side, each under its own
 * header, and all stay visible; only the focused one is `active` (it owns
 * shortcuts, find, outline and the word count). Clicking another pane moves
 * focus without moving it. A pane's DOM position in this tree never changes
 * between split and single layouts, so editors are never remounted.
 */
export function NotesWorkspace({ visible }: { visible: boolean }) {
  const tabs = useTabs((s) => s.tabs);
  const split = useTabs((s) => s.split);
  const focusMode = useUi((s) => s.focusMode);
  const view = useVault((s) => s.view);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = view ? tabOfView(view) : null;

  if (tabs.length === 0) return null;

  const layout = split && visible ? split : null;
  const offsets: number[] = [];
  layout?.sizes.reduce((sum, size) => {
    offsets.push(sum);
    return sum + size;
  }, 0);
  const placeOf = (tab: TabRef) => {
    const index = layout ? layout.panes.findIndex((pane) => sameTab(pane, tab)) : -1;
    return index === -1 ? null : index;
  };

  const startResize = (index: number, event: React.PointerEvent) => {
    if (!layout || !containerRef.current) return;
    event.preventDefault();
    const width = containerRef.current.clientWidth;
    const startX = event.clientX;
    const startSizes = layout.sizes;
    const min = MIN_PANE_PX / width;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) => {
      useTabs
        .getState()
        .setSplitSizes(resizeDivider(startSizes, index, (move.clientX - startX) / width, min));
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  return (
    <div ref={containerRef} className={cx("absolute inset-0", !visible && "hidden")}>
      {tabs.map((tab) => {
        const isActive = visible && Boolean(active && sameTab(tab, active));
        const place = placeOf(tab);
        const shown = isActive || place !== null;
        return (
          <div
            key={tabKey(tab)}
            data-pane={tabKey(tab)}
            aria-hidden={!shown}
            inert={!shown}
            onMouseDownCapture={
              place !== null && !isActive
                ? () => useVault.getState().setView(viewOfTab(tab))
                : undefined
            }
            style={
              layout && place !== null
                ? { left: `${offsets[place] * 100}%`, width: `${layout.sizes[place] * 100}%` }
                : undefined
            }
            className={cx(
              "absolute inset-y-0 flex flex-col",
              place === null && "inset-x-0",
              place !== null && place > 0 && "border-l border-line-soft",
              !shown && "pointer-events-none invisible",
            )}
          >
            {place !== null && (
              <div
                className={cx(
                  "flex h-10 shrink-0 items-center pl-3 pr-2 transition-opacity duration-150",
                  focusMode && "opacity-0 hover:opacity-100",
                )}
              >
                <PaneHeader tab={tab} focused={isActive} closable />
              </div>
            )}
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0">
                {isNoteTab(tab) ? (
                  <NoteEditor note={tab} active={isActive} />
                ) : tab.kind === "graph" ? (
                  <GraphView active={isActive} />
                ) : (
                  <ProjectsView active={isActive} />
                )}
              </div>
            </div>
          </div>
        );
      })}
      {layout &&
        layout.sizes.slice(0, -1).map((_, index) => (
          <div
            key={index}
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(event) => startResize(index, event)}
            className="group absolute inset-y-0 z-10 w-2 -translate-x-1/2 cursor-col-resize"
            style={{ left: `${(offsets[index + 1] ?? 0) * 100}%` }}
          >
            <div className="mx-auto h-full w-px bg-transparent transition-colors duration-100 group-hover:bg-line group-active:bg-ink/40" />
          </div>
        ))}
    </div>
  );
}
