import { openUrl } from "@tauri-apps/plugin-opener";
import { Bookmark, Check, CheckSquare, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { EASE_OUT } from "@/lib/ease";
import { tagColor } from "@/lib/tagColor";
import { cx } from "@/lib/utils";
import { useBookmarks } from "@/stores/bookmarks";
import { useT } from "@/stores/locale";
import { useTodos } from "@/stores/todos";
import { useVault } from "@/stores/vault";

const REVEAL = { duration: 0.15, ease: EASE_OUT } as const;

export function SidebarCollections() {
  const view = useVault((state) => state.view);
  const setView = useVault((state) => state.setView);

  return (
    <>
      <TodosCollection
        active={view?.type === "todos"}
        onNavigate={() => setView({ type: "todos" })}
      />
      <BookmarksCollection
        active={view?.type === "bookmarks"}
        onNavigate={() => setView({ type: "bookmarks" })}
      />
    </>
  );
}

function TodosCollection({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const todos = useTodos((state) => state.todos);
  const loaded = useTodos((state) => state.loaded);
  const load = useTodos((state) => state.load);
  const toggleTodo = useTodos((state) => state.toggle);
  const t = useT();

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) void load();
  };

  return (
    <CollectionBlock
      active={active}
      expanded={expanded}
      icon={<CheckSquare size={15} strokeWidth={1.75} />}
      label={t("common.todos")}
      panelId="sidebar-todos-preview"
      onNavigate={onNavigate}
      onToggle={toggle}
    >
      {!loaded ? (
        <LoadingRow />
      ) : todos.length === 0 ? (
        <EmptyRow>{t("sidebar.todosEmpty")}</EmptyRow>
      ) : (
        <ul className="flex flex-col py-0.5">
          {todos.map((todo) => (
            <li key={todo.id}>
              <button
                type="button"
                title={todo.text}
                aria-label={t(todo.done ? "todos.markOpen" : "todos.markDone")}
                onClick={() => void toggleTodo(todo.id)}
                className="flex min-h-7 w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-[12px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                <span
                  className={cx(
                    "mt-0.5 grid size-3 shrink-0 place-items-center rounded-[4px] border",
                    todo.done
                      ? "border-invert bg-invert text-invert-ink"
                      : "border-line text-transparent",
                  )}
                >
                  <Check size={8} strokeWidth={3} />
                </span>
                <span
                  className={cx(
                    "min-w-0 flex-1 truncate",
                    todo.done && "text-faint line-through decoration-faint",
                  )}
                >
                  {todo.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CollectionBlock>
  );
}

function BookmarksCollection({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const bookmarks = useBookmarks((state) => state.bookmarks);
  const loaded = useBookmarks((state) => state.loaded);
  const load = useBookmarks((state) => state.load);
  const t = useT();

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) void load();
  };

  return (
    <CollectionBlock
      active={active}
      expanded={expanded}
      icon={<Bookmark size={15} strokeWidth={1.75} />}
      label={t("common.bookmarks")}
      panelId="sidebar-bookmarks-preview"
      onNavigate={onNavigate}
      onToggle={toggle}
    >
      {!loaded ? (
        <LoadingRow />
      ) : bookmarks.length === 0 ? (
        <EmptyRow>{t("sidebar.bookmarksEmpty")}</EmptyRow>
      ) : (
        <ul className="flex flex-col py-0.5">
          {bookmarks.map((bookmark) => (
            <li key={bookmark.id}>
              <button
                type="button"
                title={bookmark.title}
                aria-label={t("sidebar.openBookmark", {
                  title: bookmark.title,
                })}
                onClick={() => void openUrl(bookmark.url)}
                className="flex min-h-7 w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-[12px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink"
              >
                <span
                  className="mt-[7px] size-1.5 shrink-0 rounded-full bg-faint"
                  style={
                    bookmark.tags[0]
                      ? { backgroundColor: tagColor(bookmark.tags[0]) }
                      : undefined
                  }
                />
                <span className="min-w-0 flex-1 truncate">
                  {bookmark.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CollectionBlock>
  );
}

function CollectionBlock({
  active,
  expanded,
  icon,
  label,
  panelId,
  onNavigate,
  onToggle,
  children,
}: {
  active: boolean;
  expanded: boolean;
  icon: React.ReactNode;
  label: string;
  panelId: string;
  onNavigate: () => void;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const toggleLabel = t(
    expanded ? "sidebar.collapseCollection" : "sidebar.expandCollection",
    { label },
  );

  return (
    <div>
      <div
        className={cx(
          "group flex h-[30px] items-center rounded-md transition-colors duration-100",
          active
            ? "bg-active text-ink"
            : "text-muted hover:bg-hover hover:text-ink",
        )}
      >
        <button
          type="button"
          onClick={onNavigate}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-md pl-2 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
        >
          {icon}
          <span className="truncate font-medium">{label}</span>
        </button>
        <Tooltip label={toggleLabel} side="right">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={onToggle}
            className="mr-0.5 grid size-7 shrink-0 place-items-center rounded-md text-faint transition-[color,background-color,scale] duration-100 hover:bg-active hover:text-ink active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
          >
            <ExpandGlyph expanded={expanded} />
          </button>
        </Tooltip>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="preview"
            initial={{ height: 0, opacity: 0, y: -2 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -2 }}
            transition={REVEAL}
            className="overflow-hidden"
          >
            <div
              id={panelId}
              className="no-scrollbar ml-[15px] max-h-36 overflow-y-auto border-l border-line-soft pb-1 pl-[13px] pr-0.5 pt-0.5"
            >
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ExpandGlyph({ expanded }: { expanded: boolean }) {
  return (
    <span aria-hidden="true" className="relative block size-3">
      <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 rounded-full bg-current" />
      <span
        className={cx(
          "absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 rounded-full bg-current transition-[opacity,scale] duration-150 [transition-timing-function:var(--ease-out)]",
          expanded ? "scale-y-0 opacity-0" : "scale-y-100 opacity-100",
        )}
      />
    </span>
  );
}

function LoadingRow() {
  const t = useT();
  return (
    <div className="flex h-8 items-center gap-2 px-1.5 text-[11.5px] text-faint">
      <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
      <span>{t("sidebar.loading")}</span>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1.5 py-2 text-[11.5px] leading-4 text-faint">
      {children}
    </p>
  );
}
