import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import { translate, type MessageKey, type MessageParams } from "@/lib/i18n";
import { useLocale } from "@/stores/locale";

/** "Note exported" with the destination and a one-click Show in Finder. */
export function toastExported(path: string) {
  const t = (key: MessageKey, params?: MessageParams) =>
    translate(useLocale.getState().language, key, params);
  toast(t("toast.noteExported"), {
    description: path,
    action: {
      label: t("toast.showInFinder"),
      onClick: () => {
        ipc.revealExport(path).catch((err) => {
          toast.error(err instanceof Error ? err.message : String(err));
        });
      },
    },
  });
}
