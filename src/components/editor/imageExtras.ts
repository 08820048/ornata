import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { t } from "@/stores/locale";

const MIN_WIDTH = 80;

/**
 * How an image is written to Markdown. A plain image stays `![alt](src)`,
 * with its caption as the standard title (`![alt](src "caption")`). Markdown
 * has no syntax for size, so a resized image is written as an `<img>` tag,
 * which GitHub, Obsidian and Typora all render.
 */
export function imageMarkdown(attrs: {
  src: string;
  alt?: string | null;
  title?: string | null;
  width?: number | string | null;
}): string {
  const alt = attrs.alt ?? "";
  const title = attrs.title?.trim() ?? "";
  const width = Number(attrs.width);
  if (width > 0) {
    const attr = (name: string, value: string) => ` ${name}="${escapeAttr(value)}"`;
    return `<img${attr("src", attrs.src)}${alt ? attr("alt", alt) : ""}${title ? attr("title", title) : ""} width="${Math.round(width)}">`;
  }
  // A path with spaces or parentheses needs the <…> form to survive.
  const src = /[\s()]/.test(attrs.src) ? `<${attrs.src}>` : attrs.src;
  return `![${alt}](${src}${title ? ` "${title.replace(/"/g, '\\"')}"` : ""})`;
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Split what the source bar holds between its parentheses: `src "caption"`. */
export function parseImageTarget(inside: string): { src: string; title: string } {
  const match = /^(.*?)\s+"((?:[^"\\]|\\.)*)"\s*$/.exec(inside.trim());
  const raw = (match ? match[1] : inside).trim();
  return {
    src: raw.replace(/^<(.*)>$/, "$1"),
    title: match ? match[2].replace(/\\"/g, '"') : "",
  };
}

/** The width a drag ends at: whole pixels, never tiny, never wider than the text column. */
export function clampWidth(width: number, max: number): number {
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), Math.max(MIN_WIDTH, max)));
}

/** Captions: an image's title, shown under it. */
export function captionDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];
  state.doc.descendants((node: PmNode, pos) => {
    if (node.type.name !== "image" || !node.attrs.title) return;
    const text = String(node.attrs.title);
    decorations.push(
      Decoration.widget(
        pos + node.nodeSize,
        () => {
          const caption = document.createElement("span");
          caption.className = "image-caption";
          caption.contentEditable = "false";
          caption.textContent = text;
          return caption;
        },
        { side: -1, key: `caption:${text}`, ignoreSelection: true },
      ),
    );
  });
  return DecorationSet.create(state.doc, decorations);
}

/** Show `src` large over the window; a click or Escape puts it away. */
export function openLightbox(src: string, alt = "") {
  const overlay = document.createElement("div");
  overlay.className = "image-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", alt || t("editor.image.view"));
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  overlay.appendChild(image);
  const close = () => {
    window.removeEventListener("keydown", onKey, true);
    overlay.dataset.shown = "false";
    window.setTimeout(() => overlay.remove(), 140);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  overlay.addEventListener("click", close);
  window.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => (overlay.dataset.shown = "true"));
}

/**
 * A grip on the right edge of the image under the pointer. Dragging it sets
 * the image's width (height follows); double-clicking it returns the image to
 * its natural size. Like the table bars it lives beside the editor's DOM.
 */
class ResizeGrip {
  private readonly host: HTMLElement;
  private readonly grip = document.createElement("div");
  private image: HTMLImageElement | null = null;
  private dragging = false;

  constructor(private readonly view: EditorView) {
    this.host = view.dom.parentElement ?? view.dom;
    if (getComputedStyle(this.host).position === "static") this.host.style.position = "relative";
    this.grip.className = "image-grip";
    this.grip.dataset.shown = "false";
    this.grip.title = t("editor.image.resize");
    this.host.appendChild(this.grip);
    this.host.addEventListener("pointermove", this.onMove);
    this.host.addEventListener("pointerleave", this.onLeave);
    this.grip.addEventListener("pointerdown", this.onDown);
    this.grip.addEventListener("dblclick", this.onReset);
  }

  update() {
    if (this.image && !this.image.isConnected) this.image = null;
    this.place();
  }

  destroy() {
    this.host.removeEventListener("pointermove", this.onMove);
    this.host.removeEventListener("pointerleave", this.onLeave);
    this.grip.remove();
  }

  private readonly onMove = (event: PointerEvent) => {
    if (this.dragging || event.target === this.grip) return;
    const target = event.target;
    const image =
      target instanceof HTMLImageElement && this.view.dom.contains(target) && !target.dataset.uploading
        ? target
        : null;
    if (image === this.image) return;
    this.image = image;
    this.place();
  };

  private readonly onLeave = () => {
    if (this.dragging) return;
    this.image = null;
    this.place();
  };

  private place() {
    const shown = Boolean(this.image) && this.view.editable;
    this.grip.dataset.shown = String(shown);
    if (!shown || !this.image) return;
    const host = this.host.getBoundingClientRect();
    const rect = this.image.getBoundingClientRect();
    this.grip.style.left = `${rect.right - host.left - 12}px`;
    this.grip.style.top = `${rect.top - host.top + rect.height / 2 - 20}px`;
  }

  private nodePos(): number | null {
    if (!this.image) return null;
    const pos = this.view.posAtDOM(this.image, 0);
    return this.view.state.doc.nodeAt(pos)?.type.name === "image" ? pos : null;
  }

  private commit(width: number | null) {
    const pos = this.nodePos();
    if (pos === null) return;
    const node = this.view.state.doc.nodeAt(pos)!;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width, height: null }),
    );
  }

  private readonly onDown = (event: PointerEvent) => {
    const image = this.image;
    if (!image || !this.view.editable) return;
    event.preventDefault();
    this.dragging = true;
    this.grip.setPointerCapture(event.pointerId);
    this.grip.dataset.dragging = "true";
    const startX = event.clientX;
    const startWidth = image.getBoundingClientRect().width;
    const max = this.view.dom.clientWidth;
    let width = startWidth;
    const onMove = (move: PointerEvent) => {
      width = clampWidth(startWidth + move.clientX - startX, max);
      // Live preview on the element; the document changes once, on release.
      image.style.width = `${width}px`;
      image.style.height = "auto";
      this.place();
    };
    const onUp = () => {
      this.grip.removeEventListener("pointermove", onMove);
      this.grip.removeEventListener("pointerup", onUp);
      this.grip.removeEventListener("pointercancel", onUp);
      this.dragging = false;
      delete this.grip.dataset.dragging;
      image.style.width = "";
      image.style.height = "";
      if (Math.abs(width - startWidth) >= 1) this.commit(width);
    };
    this.grip.addEventListener("pointermove", onMove);
    this.grip.addEventListener("pointerup", onUp);
    this.grip.addEventListener("pointercancel", onUp);
  };

  private readonly onReset = (event: MouseEvent) => {
    event.preventDefault();
    this.commit(null);
  };
}

export const ImageExtras = Extension.create({
  name: "imageExtras",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("imageExtras"),
        props: {
          decorations: captionDecorations,
          handleDoubleClickOn(view, _pos, node, nodePos) {
            if (node.type.name !== "image") return false;
            const element = view.nodeDOM(nodePos);
            if (!(element instanceof HTMLImageElement)) return false;
            openLightbox(element.currentSrc || element.src, node.attrs.alt ?? "");
            return true;
          },
        },
        view: (view) => new ResizeGrip(view),
      }),
    ];
  },
});
