import { openUrl } from "@tauri-apps/plugin-opener";
import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { localized, releaseDate, UPDATES_URL } from "@/lib/whatsNew";
import { useLocale, useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";

/** `code` spans and bare https links in a change line; the rest is text. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|https:\/\/\S+[^\s.,;:!?)）。，；：])/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code key={i} className="rounded-sm bg-sunken px-1 font-mono text-[0.92em] text-ink">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("https://")) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => void openUrl(part)}
          className="break-all text-ink underline decoration-line underline-offset-2 transition-colors duration-100 hover:decoration-ink"
        >
          {part.replace(/^https:\/\//, "")}
        </button>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/**
 * Release notes after an update (and from the palette). Read-only and inside
 * the app: the user's vault is never touched.
 */
export function WhatsNewDialog() {
  const releases = useUi((s) => s.whatsNew);
  const setWhatsNew = useUi((s) => s.setWhatsNew);
  const language = useLocale((s) => s.language);
  const t = useT();
  const close = () => setWhatsNew(null);
  const open = releases !== null && releases.length > 0;
  const latest = releases?.[0];

  return (
    <Modal
      open={open}
      onClose={close}
      ariaLabel={t("whatsNew.title")}
      align="top"
      className="mt-[10vh] w-[560px]"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-line-soft px-5 py-3.5">
        <span className="text-[13px] font-semibold text-ink">{t("whatsNew.title")}</span>
        {releases && latest && (
          <span className="font-mono text-[11.5px] tabular-nums text-faint">
            {releases.length > 1
              ? t("whatsNew.range", { from: releases[releases.length - 1].version, to: latest.version })
              : latest.version}
          </span>
        )}
      </div>

      <div className="max-h-[58vh] overflow-y-auto px-5 py-4">
        {releases?.map((release, index) => {
          const text = localized(release, language);
          return (
            <section key={release.version} className={index > 0 ? "mt-6 border-t border-line-soft pt-5" : undefined}>
              <div className="flex items-baseline gap-2.5">
                <h2 className="font-mono text-[13px] font-semibold tabular-nums text-ink">{release.version}</h2>
                <time dateTime={release.dateTime} className="text-[11.5px] text-faint">
                  {releaseDate(release, language)}
                </time>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{text.summary}</p>
              <ul className="mt-3 space-y-1.5">
                {text.changes.map((change) => (
                  <li key={change} className="relative pl-3.5 text-[12.5px] leading-relaxed text-ink">
                    <span aria-hidden className="absolute top-[0.62em] left-0 size-1 rounded-full bg-faint" />
                    {inline(change)}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line-soft px-5 py-3">
        <button
          type="button"
          onClick={() => void openUrl(UPDATES_URL[language])}
          className="text-[12px] text-muted transition-colors duration-100 hover:text-ink"
        >
          {t("whatsNew.all")}
        </button>
        <Button variant="primary" size="sm" onClick={close}>
          {t("whatsNew.done")}
        </Button>
      </div>
    </Modal>
  );
}
