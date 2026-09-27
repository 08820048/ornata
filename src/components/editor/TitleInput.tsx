import { useEffect, useLayoutEffect, useRef } from "react";
import { useT } from "@/stores/locale";

/** The note title, rendered as an auto-growing bare textarea. Enter commits,
 *  Escape reverts, blur commits a non-empty value. */
export function TitleInput({
  title,
  active,
  focusNonce,
  onRename,
}: {
  title: string;
  active: boolean;
  focusNonce?: number;
  onRename: (name: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const t = useT();

  useLayoutEffect(() => {
    if (!active) return;
    const element = ref.current;
    const container = element?.parentElement;
    if (!element || !container) return;
    let frame: number | null = null;
    let observedWidth = container.getBoundingClientRect().width;
    const resize = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        resizeTitle(element);
      });
    };
    resizeTitle(element);
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width <= 0 || Math.abs(width - observedWidth) < 0.5) return;
      observedWidth = width;
      resize();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [active, title]);

  useEffect(() => {
    if (focusNonce === undefined) return;
    ref.current?.focus();
    ref.current?.select();
  }, [focusNonce]);

  const submit = () => {
    const value = ref.current?.value.trim();
    if (value && value !== title) onRename(value);
    else if (ref.current) {
      ref.current.value = title;
      resizeTitle(ref.current);
    }
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={t("editor.noteTitle")}
      defaultValue={title}
      placeholder={t("common.untitled")}
      className="note-title block w-full resize-none overflow-hidden bg-transparent text-[clamp(28px,2.4vw,34px)] font-[680] leading-[1.14] tracking-[-0.025em] text-ink [overflow-wrap:anywhere] [text-wrap:balance] outline-none placeholder:text-faint"
      onInput={(event) => resizeTitle(event.currentTarget)}
      onBlur={submit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          if (event.key === "Escape" && ref.current) {
            ref.current.value = title;
            resizeTitle(ref.current);
          }
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function resizeTitle(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}
