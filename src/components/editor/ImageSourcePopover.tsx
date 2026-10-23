import { useEffect, useRef } from "react";
import { useT } from "@/stores/locale";

/**
 * Typora-style image source bar: clicking an image reveals its Markdown
 * source below it, with the alt segment pre-selected. Enter applies the edit
 * back onto the image node, Escape dismisses, clicking elsewhere applies.
 */
export function ImageSourcePopover({
  top,
  left,
  width,
  markdown,
  onApply,
  onClose,
}: {
  top: number;
  left: number;
  width: number;
  markdown: string;
  onApply: (alt: string, src: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const closedRef = useRef(false);
  const t = useT();

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Pre-select the alt text, like Typora does.
    const altEnd = markdown.indexOf("](");
    input.setSelectionRange(2, altEnd > 1 ? altEnd : markdown.length);
  }, [markdown]);

  const finish = (apply: boolean) => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (apply) {
      const value = inputRef.current?.value.trim() ?? "";
      const match = /^!\[([^\]]*)\]\((.+)\)$/.exec(value);
      if (match) {
        onApply(match[1], match[2]);
        return;
      }
    }
    onClose();
  };

  return (
    <div
      className="absolute z-40 rounded-md border border-line-soft bg-panel px-2 py-1.5 shadow-lg shadow-black/10"
      style={{
        top,
        left: Math.max(left, 0),
        width: Math.max(width, 260),
        maxWidth: "100%",
      }}
      role="group"
      aria-label={t("editor.imageSource")}
    >
      <input
        ref={inputRef}
        type="text"
        defaultValue={markdown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label={t("editor.imageSource")}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
        className="w-full rounded-md border border-line-soft bg-panel px-2 py-1 font-mono text-[11px] text-ink outline-none transition-colors focus:border-faint"
      />
      <p className="px-1 pt-1 text-[9.5px] text-faint">
        {t("editor.imageSourceHint")}
      </p>
    </div>
  );
}
