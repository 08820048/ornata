import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import Script from "next/script";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { UMAMI_SRC, UMAMI_WEBSITE_ID } from "@/lib/analytics";
import { DMG, VERSION } from "@/lib/config";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

const TITLE = "Ornata — local-first Markdown notes for macOS";
const DESCRIPTION =
  "Ornata is a free, local-first Markdown notes app for macOS. Notes stay as plain .md files in a folder you own, with a link graph, backlinks, and an assistant that only acts when you allow it.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ornata.app"),
  title: {
    default: TITLE,
    template: "%s — Ornata",
  },
  description: DESCRIPTION,
  applicationName: "Ornata",
  keywords: [
    "markdown notes app",
    "notes app for macOS",
    "local-first notes",
    "markdown editor mac",
    "Obsidian alternative",
    "AI notes app",
    "AssistantPi",
    "Pi coding agent",
    "note taking app",
    "plain text notes",
  ],
  icons: {
    icon: "/ornata-mark-2026.png",
    apple: "/ornata-mark-2026.png",
  },
  authors: [{ name: "Ornata" }],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://ornata.app",
    siteName: "Ornata",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = { themeColor: "#fcfcfb" };

const JSON_LD = {
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
      inLanguage: "en",
      publisher: { "@id": "https://ornata.app/#org" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://ornata.app/#app",
      name: "Ornata",
      applicationCategory: "ProductivityApplication",
      operatingSystem: "macOS 12+",
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
        "AssistantPi: local AI assistant with permission-gated tools",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable}`}
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
        {children}
      </body>
    </html>
  );
}
