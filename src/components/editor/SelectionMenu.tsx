import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";

export function SelectionMenu({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

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
