import type { Metadata, Viewport } from "next";
import { Inter, Newsreader, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { UMAMI_SRC, UMAMI_WEBSITE_ID } from "@/lib/analytics";
import { DMG, VERSION } from "@/lib/config";
import { COPY, type Locale } from "@/lib/copy";
import { LocaleProvider } from "@/lib/locale";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

// The app's own UI typeface, used only inside the product demos.
const appSans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// The app's note typeface (Space Grotesk), used only inside the product demos.
const noteSans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});


export const viewport: Viewport = { themeColor: "#fcfcfb" };

const KEYWORDS: Record<Locale, string[]> = {
  en: [
    "markdown notes app",
    "notes app for macOS",
    "local-first notes",
    "markdown editor mac",
    "Obsidian alternative",
    "AI notes app",
    "MCP server for notes",
    "Claude Code notes",
    "note taking app",
    "plain text notes",
  ],
  zh: ["Markdown 笔记", "macOS 笔记应用", "本地优先笔记", "Obsidian 替代", "MCP 笔记", "纯文本笔记", "AI 智能体 笔记"],
};

/** Site-wide metadata; each root layout calls this with its language. */
export function siteMetadata(locale: Locale): Metadata {
  const { title, description } = COPY[locale].meta;
  const url = locale === "en" ? "https://ornata.app" : "https://ornata.app/zh";
  return {
    metadataBase: new URL("https://ornata.app"),
    title: { default: title, template: "%s — Ornata" },
    description,
    applicationName: "Ornata",
    keywords: KEYWORDS[locale],
    icons: { icon: "/ornata-mark-2026.png", apple: "/ornata-mark-2026.png" },
    authors: [{ name: "Ornata" }],
    openGraph: { title, description, url, siteName: "Ornata", type: "website", locale: locale === "en" ? "en_US" : "zh_CN" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function jsonLd(locale: Locale, DESCRIPTION: string) {
  return {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://ornata.app/#org",
      name: "Ornata",
      url: "https://ornata.app",
      logo: "https://ornata.app/ornata-mark-2026.png",
      description: DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": "https://ornata.app/#site",
      url: "https://ornata.app",
      name: "Ornata",
      description: DESCRIPTION,
      inLanguage: COPY[locale].htmlLang,
      publisher: { "@id": "https://ornata.app/#org" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://ornata.app/#app",
      name: "Ornata",
      applicationCategory: "ProductivityApplication",
      operatingSystem: "macOS 12+, Windows 10+",
      description: DESCRIPTION,
      url: "https://ornata.app",
      image: "https://ornata.app/ornata-mark-2026.png",
      downloadUrl: DMG,
      softwareVersion: VERSION,
      releaseNotes: "https://ornata.app/updates",
      author: { "@id": "https://ornata.app/#org" },
      publisher: { "@id": "https://ornata.app/#org" },
      featureList: [
        "Plain Markdown files in real folders",
        "Local-first: notes stay on your Mac",
        "No account required",
        "Opens the same plain-Markdown folder as Obsidian, and preserves frontmatter",
        "Backlinks and unlinked mentions",
        "Link graph of the vault, plus a local graph on each note",
        "Vault-wide open tasks",
        "PDF export with a heading outline, and standalone HTML",
        "LaTeX math (KaTeX) and Mermaid diagrams",
        "Full-text search across titles and content",
        "MCP server and command line: let any AI agent search and edit your vault, with per-vault access levels",
        "Split view, focus mode, and a bottom status bar with keyboard shortcuts",
        "Signed and notarized builds with an auto-update feed",
        "English and Simplified Chinese interface",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: "https://ornata.app",
      },
    },
  ],
};
}

export function RootShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const DESCRIPTION = COPY[locale].meta.description;
  const JSON_LD = jsonLd(locale, DESCRIPTION);
  return (
    <html
      lang={COPY[locale].htmlLang}
      className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable} ${appSans.variable} ${noteSans.variable}`}
    >
      <head>
        <link
          rel="alternate"
          type="text/plain"
          href="https://ornata.app/llms.txt"
          title="LLMs.txt"
        />
      </head>
      <body>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {UMAMI_WEBSITE_ID ? (
          <Script
            defer
            src={UMAMI_SRC}
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        ) : null}
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
