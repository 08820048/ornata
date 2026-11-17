import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DownloadModal } from "@/components/DownloadModal";
import { DownloadButton } from "@/components/ui/download-button";
import { COPY, type Locale } from "@/lib/copy";
import { RELEASES, type Release } from "@/lib/releases";
import { Kicker } from "./ui/kicker";

export function UpdatesView({ locale }: { locale: Locale }) {
  const copy = COPY[locale].updates;
  const text = (release: Release) => (locale === "zh" && release.zh) || release;
  const date = (release: Release) =>
    locale === "zh"
      ? release.dateTime.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, "$1年$2月$3日")
      : release.date;
  const latest = RELEASES[0];
  return (
    <>
      <Nav />
      <main className="px-3 pb-3 pt-24 sm:px-6 sm:pb-6 sm:pt-28">
        <div className="mx-auto w-full max-w-[1440px] border-x border-t border-border bg-paper">
          <header className="border-b border-border">
            <div className="px-5 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
              <Kicker index={copy.archive}>{copy.eyebrow}</Kicker>
              <div className="mt-6 flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-end">
                <div className="max-w-4xl">
                  <h1 className="text-balance font-serif text-[48px] leading-[0.96] tracking-[-0.04em] text-foreground sm:text-[72px]">
                    {copy.title}
                  </h1>
                  <p className="mt-6 max-w-xl text-pretty text-[15px] leading-7 text-muted-foreground">
                    {copy.summary(latest.version, date(latest), text(latest).summary)}
                  </p>
                </div>
                <DownloadButton label={copy.download} size="md" />
              </div>
            </div>
          </header>

          <div>
            <section
              aria-label={copy.ariaLabel}
              className="px-5 sm:px-10 lg:px-16"
            >
              {RELEASES.map((release, index) => (
                <article
                  key={release.version}
                  className="grid gap-6 border-b border-border py-10 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-10 sm:py-14"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[12px] font-medium text-foreground">
                        v{release.version}
                      </p>
                      {index === 0 ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-primary-foreground">
                          {copy.latest}
                        </span>
                      ) : null}
                    </div>
                    <time
                      dateTime={release.dateTime}
                      className="mt-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-faint"
                    >
                      {date(release)}
                    </time>
                  </div>

                  <div className="min-w-0 max-w-3xl">
                    <h2 className="text-balance text-[21px] font-medium leading-7 tracking-[-0.015em] text-foreground sm:text-[24px]">
                      {text(release).summary}
                    </h2>
                    <ul className="mt-6 space-y-3">
                      {text(release).changes.map((change) => (
                        <li
                          key={change}
                          className="flex items-start gap-3 text-pretty text-[14px] leading-6 text-muted-foreground"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-[10px] size-1 shrink-0 rounded-full bg-faint"
                          />
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </div>
      </main>
      <Footer />
      <DownloadModal />
    </>
  );
}
