import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import { noteAssetRoot } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";
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
  try {
    const data = await fileToDataUrl(file);
    const extension = file.type.split("/")[1]?.split("+")[0] || "png";
    const absPath =
      note.kind === "vault"
        ? await ipc.saveImageAsset(data, extension)
        : await ipc.saveExternalImage(note.path, data, extension);
    const assetRoot = noteAssetRoot(vaultRoot, note).replace(/\\/g, "/");
    const normalizedPath = absPath.replace(/\\/g, "/");
    const rel = normalizedPath.startsWith(`${assetRoot}/`)
      ? normalizedPath.slice(assetRoot.length + 1)
      : normalizedPath;
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .setImage({ src: rel } as never)
      .run();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : t("toast.imageSaveFailed"));
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("could not read image"));
    reader.readAsDataURL(file);
  });
}
