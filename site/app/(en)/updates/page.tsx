import type { Metadata } from "next";
import { UpdatesView } from "@/components/UpdatesView";
import { RELEASES } from "@/lib/releases";

const LATEST = RELEASES[0];
const UPDATES_DESCRIPTION = `Release notes for Ornata on macOS. Version ${LATEST.version}: ${LATEST.summary}`;

export const metadata: Metadata = {
  title: "Updates",
  description: UPDATES_DESCRIPTION,
  alternates: { canonical: "/updates", languages: { en: "/updates", "zh-CN": "/zh/updates" } },
  openGraph: {
    title: "Updates — Ornata",
    description: UPDATES_DESCRIPTION,
    url: "https://ornata.app/updates",
  },
  twitter: {
    card: "summary_large_image",
    title: "Updates — Ornata",
    description: UPDATES_DESCRIPTION,
  },
};

export default function UpdatesPage() {
  return <UpdatesView locale="en" />;
}
