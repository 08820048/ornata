import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  ArrowUp,
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { EASE_OUT, SPRING_PANEL } from "@/lib/ease";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";

export function SelectionMenu({
  editor,
  onAskAI,
}: {
  editor: Editor;
  onAskAI: (request: string, selectedText: string) => void;
}) {
  const [askOpen, setAskOpen] = useState(false);
  const [askDraft, setAskDraft] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const askInputRef = useRef<HTMLInputElement>(null);
  const askSelectionRef = useRef("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  useEffect(() => {
    if (askOpen) askInputRef.current?.focus();
  }, [askOpen]);

  useEffect(() => {
    const closeTransientMenus = () => {
      setAskOpen(false);
      setLinkOpen(false);
    };
    editor.on("selectionUpdate", closeTransientMenus);
    return () => {
      editor.off("selectionUpdate", closeTransientMenus);
    };
  }, [editor]);

  const openAsk = () => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, "\n", "\n");
    if (!selectedText.trim()) return;
    askSelectionRef.current = selectedText;
    setAskDraft("");
    setLinkOpen(false);
    setAskOpen(true);
  };

  const submitAsk = () => {
    const request = askDraft.trim();
    if (!request) return;
    onAskAI(request, askSelectionRef.current);
    setAskDraft("");
    setAskOpen(false);
  };

  const applyLink = () => {
    const url = linkInputRef.current?.value.trim();
    setLinkOpen(false);
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="selection-menu"
      shouldShow={({ state }) => !state.selection.empty}
      options={{ placement: "top", offset: 8 }}
    >
      <div className="flex flex-col items-start gap-2">
        <AnimatePresence initial={false}>
          {askOpen && (
            <motion.form
              key="selection-ask"
              aria-label={t("editor.askAi")}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: 4,
                scale: 0.98,
                transition: { duration: 0.14, ease: EASE_OUT },
              }}
              transition={SPRING_PANEL}
              onSubmit={(event) => {
                event.preventDefault();
                submitAsk();
              }}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
                  setAskOpen(false);
                }
              }}
              className="flex w-[340px] max-w-[calc(100vw-24px)] items-center gap-1 rounded-2xl bg-bg p-2 shadow-xl shadow-black/15 dark:shadow-black/50"
            >
              <Sparkles
                size={14}
                strokeWidth={1.9}
                className="ml-2 shrink-0 text-muted"
              />
              <input
                ref={askInputRef}
                value={askDraft}
                onChange={(event) => setAskDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setAskOpen(false);
                  }
                }}
                placeholder={t("editor.askAiPlaceholder")}
                className="h-10 min-w-0 flex-1 bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-faint"
              />
              <button
                type="submit"
                disabled={!askDraft.trim()}
                aria-label={t("editor.askAiSubmit")}
                className="grid size-10 shrink-0 place-items-center rounded-xl text-muted transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30"
              >
                <span className="grid size-7 place-items-center rounded-full bg-invert text-invert-ink">
                  <ArrowUp size={13.5} strokeWidth={2.2} />
                </span>
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center rounded-lg border border-line bg-bg p-0.5 shadow-lg shadow-black/8 dark:shadow-black/40">
          {linkOpen ? (
            <div className="flex items-center gap-1 px-1">
              <input
                ref={linkInputRef}
                defaultValue={editor.getAttributes("link").href ?? ""}
                placeholder={t("editor.pasteLink")}
                className="h-7 w-[200px] bg-transparent px-1 text-[12.5px] text-ink outline-none placeholder:text-faint"
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyLink();
                  if (event.key === "Escape") setLinkOpen(false);
                }}
                onBlur={() => setLinkOpen(false)}
              />
              <button
                type="button"
                className="rounded-md px-2 py-1 text-[12px] font-medium text-ink hover:bg-hover"
                onMouseDown={(event) => {
                  event.preventDefault();
                  applyLink();
                }}
              >
                {t("editor.setLink")}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                aria-expanded={askOpen}
                className={cx(
                  "inline-flex h-7 items-center gap-1.5 rounded-md pl-2 pr-2.5 text-[12.5px] font-medium transition-[background-color,color,opacity,transform] duration-100 active:scale-[0.96]",
                  askOpen
                    ? "bg-invert text-invert-ink"
                    : "bg-invert text-invert-ink hover:opacity-90",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (askOpen) setAskOpen(false);
                  else openAsk();
                }}
              >
                <Sparkles size={13} strokeWidth={1.9} />
                {t("editor.askAi")}
              </button>
              <div className="mx-0.5 h-4 w-px bg-line" />
              <MarkButton
                active={editor.isActive("bold")}
                label={t("editor.bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold size={14} strokeWidth={2} />
              </MarkButton>
              <MarkButton
                active={editor.isActive("italic")}
                label={t("editor.italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic size={14} strokeWidth={2} />
              </MarkButton>
              <MarkButton
                active={editor.isActive("underline")}
                label={t("editor.underline")}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
              >
                <Underline size={14} strokeWidth={2} />
              </MarkButton>
              <MarkButton
                active={editor.isActive("strike")}
                label={t("editor.strikethrough")}
                onClick={() => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough size={14} strokeWidth={2} />
              </MarkButton>
              <MarkButton
                active={editor.isActive("code")}
                label={t("editor.code")}
                onClick={() => editor.chain().focus().toggleCode().run()}
              >
                <Code size={14} strokeWidth={2} />
              </MarkButton>
              <div className="mx-0.5 h-4 w-px bg-line" />
              <MarkButton
                active={editor.isActive("link")}
                label={t("editor.link")}
                onClick={() => setLinkOpen(true)}
              >
                <LinkIcon size={14} strokeWidth={2} />
              </MarkButton>
            </>
          )}
        </div>
      </div>
    </BubbleMenu>
  );
}

function MarkButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        className={cx(
          "grid h-7 w-7 place-items-center rounded-md transition-colors duration-75",
          active ? "bg-invert text-invert-ink" : "text-muted hover:bg-hover hover:text-ink",
        )}
        onMouseDown={(event) => {
          event.preventDefault();
          onClick();
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}
