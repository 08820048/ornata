import { Plus } from "lucide-react";
import { COPY, type Locale } from "@/lib/copy";
import { Kicker } from "./ui/kicker";

export function Faq({ locale = "en" }: { locale?: Locale }) {
  const copy = COPY[locale].faq;
  const JSON_LD = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: COPY[locale].htmlLang,
    mainEntity: copy.items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <section
      id="faq"
      className="section-contain w-full scroll-mt-20 px-3 sm:px-6"
    >
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <div className="mx-auto w-full max-w-[1440px] border-x border-b border-border bg-paper">
        <div className="grid gap-12 px-5 py-20 sm:px-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-16 lg:py-28">
          <div>
            <Kicker>FAQ</Kicker>
            <h2 className="mt-5 text-balance font-serif text-[42px] leading-[1] tracking-[-0.035em] text-foreground sm:text-[54px]">
              {copy.title}
            </h2>
            <p className="mt-5 max-w-xs text-pretty text-[14px] leading-7 text-muted-foreground">
              {copy.lead}
            </p>
          </div>

          <div className="border-t border-border">
            {copy.items.map((f, index) => (
              <details
                key={f.q}
                className="group border-b border-border py-5"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 text-[15px] font-medium text-foreground">
                  <span className="flex items-start gap-4">
                    <span className="mt-0.5 hidden font-mono text-[9px] text-faint sm:block">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {f.q}
                  </span>
                  <span className="grid size-10 shrink-0 place-items-center">
                    <Plus
                      className="size-4 text-faint transition-transform duration-200 group-open:rotate-45"
                      aria-hidden
                    />
                  </span>
                </summary>
                <p className="max-w-2xl pb-2 pl-0 pr-10 pt-2 text-pretty text-[14px] leading-7 text-muted-foreground sm:pl-9">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
