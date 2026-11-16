import { convertFileSrc } from "@tauri-apps/api/core";
import { memo, useMemo, useState } from "react";
import { isRemoteSource, resolveAssetPath } from "@/components/editor/extensions";
import { previewBlocks, type ItemMarker, type PreviewBlock } from "@/lib/library";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";

/**
 * A note's first page in miniature — a card's face, and the front paper of a
 * folder. The title is real size; the body is laid out at reading size
 * (`.library-page` in styles.css) and scaled down, so it wraps and spaces
 * like the note itself rather than being squeezed by a tiny font.
 */
export const ThumbPage = memo(function ThumbPage({
  title,
  text,
  pad,
  ready = true,
  children,
}: {
  title: string;
  /** null while the preview is still being read. */
  text: string | null;
  pad: number;
  /** Off until the card nears the viewport: the body isn't built before that. */
  ready?: boolean;
  /** Replaces the title (the inline rename field). */
  children?: React.ReactNode;
}) {
  const t = useT();
  const blocks = useMemo(
    () => (ready && text ? previewBlocks(text, title) : []),
    [ready, text, title],
  );
  return (
    <div className="flex size-full flex-col overflow-hidden" style={{ padding: pad }}>
      {children ?? (
        <div className="library-title mb-2 line-clamp-3 shrink-0 text-[14px] font-bold leading-[20px] text-ink">
          {title}
        </div>
      )}
      {text === "" ? (
        <div className="grid flex-1 place-items-center pb-6 text-[12px] text-faint">
          {t("library.blank")}
        </div>
      ) : (
        <div aria-hidden className="relative min-h-0 flex-1">
          <div className="library-page absolute left-0 top-0">
            {blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function Block({ block }: { block: PreviewBlock }) {
  switch (block.kind) {
    case "heading":
      return <div className={`library-h library-h${Math.min(block.level, 4)}`}>{block.text}</div>;
    case "text":
      return <div className="library-p">{block.text}</div>;
    case "item":
      return (
        <div className="library-li" style={{ paddingLeft: block.depth * 24 }}>
          <Marker marker={block.marker} label={block.label} />
          <span className={cx("min-w-0", block.marker === "canceled" && "text-faint line-through")}>
            {block.text}
          </span>
        </div>
      );
    case "quote":
      return <div className="library-quote">{block.text}</div>;
    case "code":
      return (
        <div className="library-code">
          <div className="library-code-head">{block.lang}</div>
          <div className="px-[28px] py-[12px]">
            {block.lines.map((line, index) => (
              <div key={index} className="truncate whitespace-pre">
                {line || " "}
              </div>
            ))}
          </div>
        </div>
      );
    case "table":
      return (
        <div className="library-table">
          {block.rows.map((row, index) => (
            <div key={index} className={cx("flex", index === 0 && "library-table-head")}>
              {row.map((cell, at) => (
                <span key={at} className="library-td">
                  {cell}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    case "image":
      return <PreviewImage src={block.src} />;
    case "rule":
      return <div className="library-rule" />;
  }
}

/**
 * A vault image at thumbnail size. Remote images stay a placeholder: opening
 * the library must not send a request for every picture in a folder.
 */
function PreviewImage({ src }: { src: string }) {
  const root = useVault((s) => s.root);
  const [failed, setFailed] = useState(false);
  if (failed || !root || isRemoteSource(src)) return <div className="library-image-blank" />;
  let path = src;
  try {
    path = decodeURI(src);
  } catch {
    // Not percent-encoded after all; use it as written.
  }
  return (
    <img
      src={convertFileSrc(resolveAssetPath(root, path))}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className="library-image"
    />
  );
}

function Marker({ marker, label }: { marker: ItemMarker; label: string }) {
  if (marker === "bullet") {
    return (
      <span className="library-marker">
        <span className="size-[5.5px] rounded-full bg-muted" />
      </span>
    );
  }
  if (marker === "number") return <span className="library-marker text-muted">{label}.</span>;
  return (
    <span className="library-marker">
      <span
        className={cx(
          "grid size-[16px] place-items-center rounded-[4px] border",
          marker === "done" ? "border-[var(--accent)] bg-[var(--accent)]" : "border-todo",
          marker === "canceled" && "border-faint",
        )}
      >
        {marker === "doing" && <span className="size-[7px] rounded-[2px] bg-todo" />}
      </span>
    </span>
  );
}
