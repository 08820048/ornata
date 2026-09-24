import type { Editor } from "@tiptap/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, Download, ExternalLink, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import type { MenuItem } from "@/components/ui/ContextMenu";
import { ipc } from "@/lib/ipc";
import { t } from "@/stores/locale";
import { isRemoteSource, resolveAssetPath } from "./extensions";
import { reuploadImage } from "./insertImage";

/**
 * An image node targeted by the context menu. `src` is what the node stores
 * (and what upload swaps out); `source` is what Rust can load: an absolute
 * path, an http(s) URL or a data URL.
 */
export interface ImageTarget {
  src: string;
  source: string;
  kind: "local" | "remote" | "data";
}

export function imageTarget(
  attrs: { src?: string | null; vaultSrc?: string | null },
  assetRoot: string,
): ImageTarget | null {
  const src = attrs.vaultSrc ?? attrs.src ?? "";
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return { src, source: src, kind: "remote" };
  if (/^data:image\//i.test(src)) return { src, source: src, kind: "data" };
  if (/^file:\/\//i.test(src) || src.startsWith("/")) {
    return { src, source: src, kind: "local" };
  }
  if (isRemoteSource(src) || !assetRoot) return null;
  return { src, source: resolveAssetPath(assetRoot, src), kind: "local" };
}

export function imageMenuItems(editor: Editor, target: ImageTarget): MenuItem[] {
  const items: MenuItem[] = [
    {
      label: t("editor.image.upload"),
      icon: CloudUpload,
      onSelect: () => void reuploadImage(editor, target.src, target.source),
    },
  ];
  if (target.kind !== "data") {
    items.push({
      label: t("editor.image.open"),
      icon: ExternalLink,
      onSelect: () => void guard(openImage(target)),
    });
  }
  items.push(
    {
      label: t("editor.image.copy"),
      icon: Copy,
      onSelect: () => copyImage(target),
    },
    {
      label: t("editor.image.saveAs"),
      icon: Download,
      onSelect: () =>
        void guard(
          ipc.saveImageAs(target.source).then((path) => {
            if (path) toast.success(t("toast.imageSavedAs"));
          }),
        ),
    },
  );
  return items;
}

function openImage(target: ImageTarget) {
  return target.kind === "remote"
    ? openUrl(target.source)
    : ipc.openLocalImage(target.source);
}

/**
 * Copy the image to the system clipboard as PNG — the one image type
 * WebKit's async clipboard accepts. The ClipboardItem is built synchronously
 * with a pending blob so the write stays inside the click's user gesture
 * (Safari rejects clipboard writes issued after an await).
 */
function copyImage(target: ImageTarget) {
  const png = ipc.readImage(target.source).then(({ data }) => toPngBlob(data));
  navigator.clipboard
    .write([new ClipboardItem({ "image/png": png })])
    .then(() => toast.success(t("toast.imageCopied")))
    .catch((err) => showError(err));
}

async function toPngBlob(dataUrl: string): Promise<Blob> {
  const blob = dataUrlToBlob(dataUrl);
  if (blob.type === "image/png") return blob;
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  // SVGs without intrinsic size report 0 — fall back to a sensible canvas.
  canvas.width = image.naturalWidth || 1024;
  canvas.height = image.naturalHeight || 1024;
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (png) => (png ? resolve(png) : reject(new Error("could not encode image"))),
      "image/png",
    ),
  );
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64 = ""] = dataUrl.split(",", 2);
  const mime = /^data:([^;]+)/.exec(header)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function guard(promise: Promise<unknown>) {
  return promise.catch(showError);
}

function showError(err: unknown) {
  toast.error(err instanceof Error ? err.message : String(err));
}
