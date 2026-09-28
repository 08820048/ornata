import { History, SquarePen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cx } from "@/lib/utils";
import { useAgent } from "@/stores/agent";
import { useLocale, useT } from "@/stores/locale";

/**
 * New chat + saved conversations, in the panel header. Conversations are
 * stored with the vault (.ornata/agent/sessions), so reopening one restores
 * both the transcript and what the model remembers.
 */
export function ChatControls({ disabled }: { disabled: boolean }) {
  const t = useT();
  const language = useLocale((s) => s.language);
  const chats = useAgent((s) => s.chats);
  const hasMessages = useAgent((s) => s.messages.length > 0);
  const { newChat, listChats, openChat } = useAgent.getState();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void listChats();
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, listChats]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString(language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const iconButton =
    "grid size-10 place-items-center rounded-xl text-faint transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40";

  return (
    <div ref={ref} className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center">
      <button
        type="button"
        aria-label={t("agent.newChat")}
        title={t("agent.newChat")}
        disabled={disabled || !hasMessages}
        onClick={() => void newChat()}
        className={iconButton}
      >
        <SquarePen size={15} />
      </button>
      <button
        type="button"
        aria-label={t("agent.history")}
        aria-expanded={open}
        title={t("agent.history")}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cx(iconButton, open && "bg-hover text-ink")}
      >
        <History size={15} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: EASE_OUT }}
            className="absolute left-0 top-12 z-20 w-72 origin-top-left overflow-hidden rounded-xl border border-line bg-bg p-1.5 shadow-xl shadow-black/10"
          >
            <p className="px-2 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">
              {t("agent.history")}
            </p>
            <div className="max-h-72 overflow-y-auto">
              {chats === null ? (
                <p className="px-2 py-3 text-[12px] text-faint">{t("agent.historyLoading")}</p>
              ) : chats.length === 0 ? (
                <p className="px-2 py-3 text-[12px] text-faint">{t("agent.historyEmpty")}</p>
              ) : (
                chats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!chat.current) void openChat(chat.path);
                    }}
                    className={cx(
                      "flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left transition-colors duration-100",
                      chat.current ? "bg-invert text-invert-ink" : "hover:bg-hover",
                    )}
                  >
                    <span className={cx("w-full truncate text-[12.5px]", chat.current ? "" : "text-ink")}>
                      {chat.title || t("agent.untitledChat")}
                    </span>
                    <span className={cx("text-[10.5px] tabular-nums", chat.current ? "opacity-60" : "text-faint")}>
                      {when(chat.modified)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
