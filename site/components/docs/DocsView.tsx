import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DownloadModal } from "@/components/DownloadModal";
import { BASICS } from "@/components/docs/sectionsBasics";
import { WORKFLOW } from "@/components/docs/sectionsWorkflow";
import { REFERENCE } from "@/components/docs/sectionsReference";
import { BASICS_ZH } from "@/components/docs/sectionsBasics.zh";
import { WORKFLOW_ZH } from "@/components/docs/sectionsWorkflow.zh";
import { REFERENCE_ZH } from "@/components/docs/sectionsReference.zh";
import { COPY, type Locale } from "@/lib/copy";

export function DocsView({ locale }: { locale: Locale }) {
  const copy = COPY[locale].docs;
  const sections = locale === "zh" ? [...BASICS_ZH, ...WORKFLOW_ZH, ...REFERENCE_ZH] : [...BASICS, ...WORKFLOW, ...REFERENCE];
  return (
    <>
      <Nav />
      <main className="px-3 pb-3 pt-24 sm:px-6 sm:pb-6 sm:pt-28">
        <div className="mx-auto w-full max-w-[1440px] border-x border-t border-border bg-paper">
          <header className="border-b border-border px-5 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">{copy.eyebrow}</p>
            <h1 className="mt-6 max-w-2xl text-balance font-serif text-[48px] leading-[0.96] tracking-[-0.04em] text-foreground sm:text-[72px]">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-[15px] leading-7 text-muted-foreground">
              {copy.lead}
            </p>
          </header>

          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="hidden border-r border-border lg:block">
              <nav aria-label={copy.onThisPage} className="sticky top-24 px-8 py-10">
                <ul className="space-y-1">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="block py-1 text-[12.5px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            <div className="min-w-0 px-5 sm:px-10 lg:px-16">
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 border-b border-border py-12 last:border-b-0 sm:py-16"
                >
                  <h2 className="text-balance text-[26px] font-medium leading-8 tracking-[-0.02em] text-foreground">
                    {section.title}
                  </h2>
                  <p className="mt-2 max-w-2xl text-[15px] leading-7 text-faint">{section.lead}</p>
                  <div className="mt-6 max-w-2xl">{section.body}</div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <DownloadModal />
    </>
  );
}
