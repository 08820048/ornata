import type { Metadata, Viewport } from "next";
import { Fraunces, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { UMAMI_SRC, UMAMI_WEBSITE_ID } from "@/lib/analytics";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const serif = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

const TITLE = "Ornata — the last notes app you'll download";
const DESCRIPTION =
  "Ornata is a local-first Markdown editor for macOS with plain files, syntax highlighting, todos, bookmarks, and permission-controlled AssistantPi.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ornata.app"),
  title: TITLE,
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
  "@type": "SoftwareApplication",
  name: "Ornata",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "macOS 12+",
  description: DESCRIPTION,
  url: "https://ornata.app",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
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
