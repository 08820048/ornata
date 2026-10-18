import type { Metadata } from "next";
import { UpdatesView } from "@/components/UpdatesView";
import { RELEASES } from "@/lib/releases";

const LATEST = RELEASES[0];
const DESCRIPTION = `Ornata（macOS / Windows）更新日志。版本 ${LATEST.version}:${LATEST.zh?.summary ?? LATEST.summary}`;

export const metadata: Metadata = {
  title: "更新日志",
  description: DESCRIPTION,
  alternates: { canonical: "/zh/updates", languages: { en: "/updates", "zh-CN": "/zh/updates" } },
  openGraph: { title: "更新日志 — Ornata", description: DESCRIPTION, url: "https://ornata.app/zh/updates" },
  twitter: { card: "summary_large_image", title: "更新日志 — Ornata", description: DESCRIPTION },
};

export default function UpdatesPage() {
  return <UpdatesView locale="zh" />;
}
