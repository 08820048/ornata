import { useEffect, useRef, useState } from "react";
import { ipc } from "@/lib/ipc";
import { useT } from "@/stores/locale";

/**
 * The global quick-capture field (own window, summoned by ⌘⌥J). Enter hands
 * the text to the main window — the single writer of the vault — and hides
 * the field; Shift+Enter makes a newline; Escape dismisses.
 */
export function QuickCapture() {
  const t = useT();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const dismiss = () => {
    setText("");
    void ipc.dismissQuickCapture();
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      dismiss();
      return;
    }
    setText("");
    void ipc.submitQuickCapture(trimmed).catch(() => {
      setText(trimmed);
    });
  };

  return (
    <div className="flex h-screen flex-col gap-1 p-2">
      <textarea
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            dismiss();
          }
        }}
        placeholder={t("quick.placeholder")}
        className="min-h-0 flex-1 resize-none rounded-md border border-line bg-bg px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-faint"
      />
      <p className="px-1 text-[10.5px] text-faint">{t("quick.hint")}</p>
    </div>
  );
}
