import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DownloadModal } from "@/components/DownloadModal";
import { BASICS } from "@/components/docs/sectionsBasics";
import { WORKFLOW } from "@/components/docs/sectionsWorkflow";
import { REFERENCE } from "@/components/docs/sectionsReference";

const SECTIONS = [...BASICS, ...WORKFLOW, ...REFERENCE];

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How to use Ornata: vaults, writing, links, split view, search, daily notes, export, MCP and the command line, shortcuts, and troubleshooting.",
  alternates: { canonical: "/docs" },
};

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="px-3 pb-3 pt-24 sm:px-6 sm:pb-6 sm:pt-28">
        <div className="mx-auto w-full max-w-[1440px] border-x border-t border-border bg-paper">
          <header className="border-b border-border px-5 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">Documentation</p>
            <h1 className="mt-6 max-w-2xl text-balance font-serif text-[48px] leading-[0.96] tracking-[-0.04em] text-foreground sm:text-[72px]">
              Using Ornata.
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-[15px] leading-7 text-muted-foreground">
              Everything the app does, in the order you are likely to need it.
            </p>
          </header>

          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="hidden border-r border-border lg:block">
              <nav aria-label="On this page" className="sticky top-24 px-8 py-10">
                <ul className="space-y-1">
                  {SECTIONS.map((section) => (
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
              {SECTIONS.map((section) => (
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
