import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import { noteAssetRoot } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";
import { useVault } from "@/stores/vault";
import { t } from "@/stores/locale";

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
      `${t("toast.imageUploadFailed")}: ${
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
