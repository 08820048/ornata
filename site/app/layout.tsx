import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import Script from "next/script";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { UMAMI_SRC, UMAMI_WEBSITE_ID } from "@/lib/analytics";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

const TITLE = "Ornata — Markdown, without the machinery";
const DESCRIPTION =
  "A focused, local-first Markdown editor for macOS. Plain files, real folders, and AssistantPi only when you invite it.";

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
      className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable}`}
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
