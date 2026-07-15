import { Plus } from "lucide-react";

const FAQS: { q: string; a: string }[] = [
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
    q: "Why does macOS say the app can't be verified?",
    a: "Production downloads are signed with a Developer ID certificate and notarized by Apple. Download the latest build from ornata.app; if verification fails, confirm that you have the current installer.",
  },
  {
    q: "Windows or Linux?",
    a: "macOS first. Ornata is built on Tauri, which is cross-platform, so other platforms may follow — but macOS is where it's polished today.",
  },
  {
    q: "How does AssistantPi work?",
    a: "Install and configure Pi on your Mac, then Ornata connects to that local Pi process. You keep control of the model and provider in Pi, while Ornata supplies permission-controlled tools for notes, todos, and bookmarks. The open note is attached automatically, and selected note text can be included for precise context.",
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
    <section id="faq" className="w-full scroll-mt-24 px-4 py-24 sm:px-8">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <div className="mx-auto w-full max-w-3xl">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-medium text-[12px] text-muted-foreground">
          FAQ
        </span>
        <h2 className="mt-5 text-balance font-serif text-[32px] leading-[1.1] text-foreground sm:text-[42px]">
          Questions, answered.
        </h2>

        <div className="mt-10 border-t border-border">
          {FAQS.map((f) => (
            <details key={f.q} className="group border-b border-border py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16px] font-medium text-foreground">
                {f.q}
                <Plus
                  className="size-4 shrink-0 text-faint transition-transform duration-200 group-open:rotate-45"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 max-w-2xl text-pretty text-[14.5px] leading-7 text-muted-foreground">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
