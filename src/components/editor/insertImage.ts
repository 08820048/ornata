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
    editor
      .chain()
      .focus()
      .deleteRange(clamped)
      .setImage({
        src: localSrc,
        ...(backgroundUpload ? { uploading: true } : {}),
      } as never)
      .run();
    if (backgroundUpload) {
      void uploadInBackground(editor, localSrc, data, extension);
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : t("toast.imageSaveFailed"));
  }
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
  const touch = (
    visit: (attrs: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    const targets: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== "image") return;
      if ((node.attrs.vaultSrc ?? node.attrs.src) !== localSrc) return;
      targets.push({ pos, attrs: visit(node.attrs) });
    });
    for (const { pos, attrs } of targets) {
      editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, attrs));
      replaced = true;
    }
  };
  if (url) {
    // Clear vaultSrc so renderMarkdown emits the hosted URL.
    touch((attrs) => ({ ...attrs, src: url, vaultSrc: null, uploading: false }));
  } else {
    touch((attrs) => ({ ...attrs, uploading: false }));
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
