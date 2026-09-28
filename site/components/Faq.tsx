import { Plus } from "lucide-react";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How much does Ornata cost?",
    a: "Ornata is free to download and use — no account, no subscription. Production builds are signed with an Apple Developer ID certificate and notarized by Apple.",
  },
  {
    q: "Where are my notes stored?",
    a: "On your Mac, as plain Markdown files in a folder you choose. The core editor needs no account or proprietary database, and you can open the folder in Finder at any time.",
  },
  {
    q: "Is there sync?",
    a: "Not built in yet. Because notes are just files in a folder, you can sync them today with iCloud Drive, Dropbox, or git. Native sync is on the roadmap.",
  },
  {
    q: "Does it work with Obsidian?",
    a: "Yes. Ornata uses the same plain-Markdown vault with real folders, and preserves frontmatter from other tools. Point Ornata and Obsidian at the same folder and both just work.",
  },
  {
    q: "Is there a graph view?",
    a: "Yes. The link graph opens as a tab beside your notes: folders form soft colored regions, hovering a note traces its links and their direction, and you can search, drag, and zoom. Any note can also show its own local graph beneath the text.",
  },
  {
    q: "Can I export my notes?",
    a: "They're already Markdown files, so there's nothing to export to keep them. To share, export a note as a PDF — with a bookmark outline built from its headings, plus your choice of paper size and margins — or as standalone HTML. Each export offers Show in Finder when it's done.",
  },
  {
    q: "Is the macOS download signed?",
    a: "Yes. Production downloads are signed with an Apple Developer ID certificate, notarized by Apple, and distributed through Ornata’s signed update feed.",
  },
  {
    q: "Windows or Linux?",
    a: "macOS first. Ornata is built on Tauri, which is cross-platform, so other platforms may follow — but macOS is where it's polished today.",
  },
  {
    q: "How does AssistantPi work?",
    a: "Install and configure Pi on your Mac, then Ornata connects to that local Pi process. You keep control of the model and provider in Pi, while Ornata supplies permission-controlled tools for your notes. The open note is attached automatically, and selected note text can be included for precise context.",
  },
  {
    q: "What can AssistantPi access?",
    a: "Read only is the default. Read & write can create and update content but cannot run shell commands or perform destructive structured actions. Full Access enables every Pi tool, including shell commands, plus complete Ornata CRUD. You choose the mode in the composer before sending.",
  },
  {
    q: "Does AssistantPi keep everything on my Mac?",
    a: "The Pi process and your Ornata files run locally. If the model configured in Pi is remote, the prompt and attached context are sent to that model provider under its terms. Fully local or offline behavior depends on the model setup you choose in Pi.",
  },
  {
    q: "How do updates work?",
    a: "Ornata automatically checks its signed update feed. When a release is available, you can download it with visible progress and restart to install it. Production builds are Developer ID signed and notarized by Apple.",
  },
  {
    q: "Which interface languages are supported?",
    a: "English and Simplified Chinese are built in. You can switch languages from Settings without changing the language of your notes.",
  },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export function Faq() {
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
      <div className="mx-auto grid w-full max-w-[1440px] border-x border-b border-border bg-paper lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border px-8 py-20 lg:block">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
            Details
          </p>
        </aside>
        <div className="grid gap-12 px-5 py-20 sm:px-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-16 lg:py-28">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
              FAQ
            </p>
            <h2 className="mt-5 text-balance font-serif text-[42px] leading-[1] tracking-[-0.035em] text-foreground sm:text-[54px]">
              The practical questions.
            </h2>
            <p className="mt-5 max-w-xs text-pretty text-[14px] leading-7 text-muted-foreground">
              Storage, compatibility, updates, and exactly what AssistantPi can
              access.
            </p>
          </div>

          <div className="border-t border-border">
            {FAQS.map((f, index) => (
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
