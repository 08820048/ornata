import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import { noteAssetRoot } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";
import { useVault } from "@/stores/vault";
import { t } from "@/stores/locale";

/** Save a pasted/dropped image beside its note and insert a relative path. */
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
    const src = await uploadOrSave(data, extension, vaultRoot, note);
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .setImage({ src } as never)
      .run();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : t("toast.imageSaveFailed"));
  }
}

/**
 * Route an image through the configured upload service, or save it into the
 * vault when the service is off. A failing upload falls back to the local
 * copy so the paste still lands — the toast carries the upload error.
 */
async function uploadOrSave(
  data: string,
  extension: string,
  vaultRoot: string,
  note: NoteRef,
): Promise<string> {
  const { imageUpload } = useVault.getState();
  if (imageUpload.mode === "custom" && imageUpload.command) {
    try {
      return await ipc.uploadImage(data, extension);
    } catch (err) {
      toast.error(
        `${t("toast.imageUploadFailed")}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return saveLocally(data, extension, vaultRoot, note);
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
