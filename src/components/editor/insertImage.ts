import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import { noteAssetRoot } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";
import { useVault } from "@/stores/vault";
import { t } from "@/stores/locale";

/**
 * Find the first image file in a clipboard / data-transfer payload.
 *
 * macOS Tauri renders in WKWebView (Safari's engine), which leaves
 * `clipboardData.files` empty for pasted images: screenshots and images
 * copied from a web page only show up in `clipboardData.items` as a
 * `kind: "file"` entry. Chromium/Electron populate both. Reading only
 * `.files` makes the paste handler bail out, after which ProseMirror's
 * default paste finds no text/html to parse and inserts nothing — a silent
 * no-op with no error. Check both sources so paste works everywhere.
 */
export function imageFileFromDataTransfer(
  data: DataTransfer | null | undefined,
): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith("image/")) return file;
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

/**
 * Paste/drop entry, Typora-style: land the image as a local vault asset
 * immediately (the paste visibly lands at once), then — if a custom upload
 * command is configured — upload in the background and swap the local path
 * for the hosted URL in place. On upload failure the local image stays.
 */
export async function insertImageFile({
  editor,
  file,
  range,
  vaultRoot,
  note,
}: {
  editor: Editor;
  file: File;
  range: { from: number; to: number };
  vaultRoot: string;
  note: NoteRef;
}) {
  const extension = file.type.split("/")[1]?.split("+")[0] || "png";
  try {
    const data = await fileToDataUrl(file);
    const localSrc = await saveLocally(data, extension, vaultRoot, note);
    // Save is async and can outlive the editor (tab closed, remount).
    if (!editor || editor.isDestroyed) return;
    // The doc may have changed while we awaited — clamp the paste range so
    // deleteRange can't hit an out-of-bounds position.
    const size = editor.state.doc.content.size;
    const clamped = {
      from: Math.min(range.from, size),
      to: Math.min(range.to, size),
    };
    const { imageUpload } = useVault.getState();
    const backgroundUpload =
      imageUpload.mode === "custom" && imageUpload.command.trim().length > 0;
    // Insert with the universal attrs only. Never pass custom attrs through
    // setImage/insertContent: Tiptap validates JSON attrs against the schema
    // (Node.fromJSON → checkAttrs) and, on a mismatch, silently inserts
    // nothing — which is exactly what happened against an editor whose schema
    // predates the `uploading` attribute (HMR keeps the live editor instance).
    editor
      .chain()
      .focus()
      .deleteRange(clamped)
      .setImage({ src: localSrc } as never)
      .run();
    if (backgroundUpload) {
      markUploading(editor, localSrc);
      void uploadInBackground(editor, localSrc, data, extension);
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : t("toast.imageSaveFailed"));
  }
}

/**
 * Context-menu "Upload image": push an image that is already in the doc
 * (local or previously hosted) through the upload command again and swap
 * every node showing `src` for the new hosted URL.
 */
export async function reuploadImage(editor: Editor, src: string, source: string) {
  const { imageUpload } = useVault.getState();
  if (imageUpload.mode !== "custom" || !imageUpload.command.trim()) {
    toast.error(t("toast.imageUploadOff"), {
      action: {
        label: t("common.settings"),
        onClick: () => void ipc.openSettingsWindow(),
      },
    });
    return;
  }
  markUploading(editor, src);
  let image: { data: string; extension: string };
  try {
    image = await ipc.readImage(source);
  } catch (err) {
    if (!editor.isDestroyed) {
      forEachImageWithSrc(editor, src, (attrs) => ({ ...attrs, uploading: false }));
    }
    toast.error(
      `${t("toast.imageUploadRetryFailed")}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return;
  }
  await uploadInBackground(
    editor,
    src,
    image.data,
    image.extension,
    "toast.imageUploadRetryFailed",
  );
}

/**
 * Flag the freshly inserted local image as "uploading". Uses setNodeMarkup
 * (lenient attrs path) and only when the schema knows the attribute, so an
 * editor running a schema without `uploading` still gets the image — just
 * without the pulsing preview.
 */
function markUploading(editor: Editor, localSrc: string) {
  const attrs = editor.schema.nodes.image.spec.attrs;
  if (!attrs || !("uploading" in attrs)) return;
  forEachImageWithSrc(editor, localSrc, (attrs) => ({ ...attrs, uploading: true }));
}

/**
 * Apply an attrs transform to every image node whose vaultSrc/src matches
 * `localSrc`, dispatching a single transaction when anything matched.
 */
function forEachImageWithSrc(
  editor: Editor,
  localSrc: string,
  update: (attrs: Record<string, unknown>) => Record<string, unknown>,
) {
  const targets: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image") return;
    if ((node.attrs.vaultSrc ?? node.attrs.src) !== localSrc) return;
    targets.push({ pos, attrs: update(node.attrs) });
  });
  if (targets.length === 0) return false;
  const tr = editor.state.tr;
  for (const { pos, attrs } of targets) {
    tr.setNodeMarkup(pos, undefined, attrs);
  }
  editor.view.dispatch(tr);
  return true;
}

/**
 * Upload in the background, then replace the image node(s) pointing at
 * `localSrc` with the hosted URL. Failure keeps the local image and toasts.
 */
async function uploadInBackground(
  editor: Editor,
  localSrc: string,
  data: string,
  extension: string,
  failureKey: "toast.imageUploadFailed" | "toast.imageUploadRetryFailed" =
    "toast.imageUploadFailed",
) {
  let url: string | null = null;
  let failure: unknown = null;
  try {
    url = await ipc.uploadImage(data, extension);
  } catch (err) {
    failure = err;
  }
  if (editor.isDestroyed) return;
  let replaced = false;
  if (url) {
    // Clear vaultSrc so renderMarkdown emits the hosted URL.
    replaced = forEachImageWithSrc(editor, localSrc, (attrs) => ({
      ...attrs,
      src: url,
      vaultSrc: null,
      uploading: false,
    }));
  } else {
    forEachImageWithSrc(editor, localSrc, (attrs) => ({
      ...attrs,
      uploading: false,
    }));
    toast.error(
      `${t(failureKey)}: ${
        failure instanceof Error ? failure.message : String(failure)
      }`,
    );
  }
  if (url && replaced) {
    toast.success(t("toast.imageUploaded"));
  }
}

async function saveLocally(
  data: string,
  extension: string,
  vaultRoot: string,
  note: NoteRef,
): Promise<string> {
  const absPath =
    note.kind === "vault"
      ? await ipc.saveImageAsset(data, extension)
      : await ipc.saveExternalImage(note.path, data, extension);
  const assetRoot = noteAssetRoot(vaultRoot, note).replace(/\\/g, "/");
  const normalizedPath = absPath.replace(/\\/g, "/");
  return normalizedPath.startsWith(`${assetRoot}/`)
    ? normalizedPath.slice(assetRoot.length + 1)
    : normalizedPath;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("could not read image"));
    reader.readAsDataURL(file);
  });
}
