import type { Editor } from "@tiptap/react";
import { ArrowDown, ArrowUp, CaseSensitive, Replace, ReplaceAll, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  currentMatch,
  dispatchFind,
  gotoMatch,
  replaceAll,
  replaceCurrent,
} from "./findReplace";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";

/**
 * Find & replace bar, docked top-right of the active pane (VS Code style).
 * Query state lives in the findReplace plugin; this component mirrors the
 * match count/index out of it for display.
 */
export function FindReplaceBar({
  editor,
  withReplace,
  onClose,
}: {
  editor: Editor;
  withReplace: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(withReplace);
  const [match, setMatch] = useState({ count: 0, index: 0 });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    dispatchFind(editor.view, { query, caseSensitive, index: 0 });
  }, [query, caseSensitive, editor]);

  useEffect(() => {
    const update = () => {
      const { count, index } = currentMatch(editor.view.state);
      setMatch((prev) => (prev.count === count && prev.index === index ? prev : { count, index }));
    };
    editor.on("transaction", update);
    update();
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  const goNext = useCallback(() => gotoMatch(editor, match.index + 1), [editor, match.index]);
  const goPrev = useCallback(() => gotoMatch(editor, match.index - 1), [editor, match.index]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) goPrev();
      else goNext();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="pointer-events-auto fixed right-4 top-3 z-30 w-[300px] rounded-md border border-line bg-panel p-1.5 shadow-sm">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("find.placeholder")}
          className="min-w-0 flex-1 rounded bg-bg px-2 py-1 text-[12.5px] text-ink outline-none placeholder:text-faint"
          aria-label={t("find.placeholder")}
        />
        <span className="min-w-[52px] text-center text-[10.5px] tabular-nums text-faint">
          {query
            ? match.count
              ? t("find.position", { index: match.index + 1, count: match.count })
              : t("find.noMatches")
            : ""}
        </span>
        <IconButton label={t("find.case")} active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)}>
          <CaseSensitive size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton label={t("find.previous")} onClick={goPrev} disabled={!match.count}>
          <ArrowUp size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton label={t("find.next")} onClick={goNext} disabled={!match.count}>
          <ArrowDown size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton label={t("find.replaceMode")} active={showReplace} onClick={() => setShowReplace((v) => !v)}>
          <Replace size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton label={t("common.close")} onClick={onClose}>
          <X size={14} strokeWidth={1.75} />
        </IconButton>
      </div>
      {showReplace && (
        <div className="mt-1 flex items-center gap-1">
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("find.replaceWith")}
            className="min-w-0 flex-1 rounded bg-bg px-2 py-1 text-[12.5px] text-ink outline-none placeholder:text-faint"
            aria-label={t("find.replaceWith")}
          />
          <IconButton
            label={t("find.replaceOne")}
            onClick={() => replaceCurrent(editor, replacement)}
            disabled={!match.count}
          >
            <Replace size={14} strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label={t("find.replaceAll")}
            onClick={() => replaceAll(editor, replacement)}
            disabled={!match.count}
          >
            <ReplaceAll size={14} strokeWidth={1.75} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "shrink-0 rounded p-1 transition-colors duration-100",
        active ? "bg-active text-ink" : "text-faint hover:bg-hover hover:text-muted",
        disabled && "cursor-default opacity-40 hover:bg-transparent hover:text-faint",
      )}
    >
      {children}
    </button>
  );
}
