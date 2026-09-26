import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { ipc } from "@/lib/ipc";
import { useT } from "@/stores/locale";

/**
 * "Save note as template" prompt: asks for a template name, copies the
 * note's current content (unsaved edits included) into
 * .ornata/templates/<name>.md. Rendered by the active pane.
 */
export function SaveTemplateDialog({
  defaultName,
  getContent,
  onClose,
}: {
  defaultName: string;
  getContent: () => Promise<string>;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const content = await getContent();
      await ipc.writeTemplate(trimmed, content);
      toast(t("templates.saved"), { description: trimmed });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} className="w-[400px]" ariaLabel={t("templates.save")}>
      <div className="p-4">
        <h2 className="pb-3 text-[14px] font-semibold text-ink">{t("templates.save")}</h2>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
            if (event.key === "Escape") onClose();
          }}
          placeholder={t("templates.name")}
          aria-label={t("templates.name")}
          className="w-full rounded-md border border-line bg-bg px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors duration-100 placeholder:text-faint focus:border-muted"
        />
        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-muted transition-colors duration-100 hover:bg-hover"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!name.trim() || saving}
            onClick={() => void save()}
            className="rounded-md bg-invert px-3 py-1.5 text-[12.5px] font-medium text-invert-ink transition-opacity duration-100 disabled:opacity-40"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
