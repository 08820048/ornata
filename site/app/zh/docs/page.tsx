import type { Metadata } from "next";
import { DocsView } from "@/components/docs/DocsView";
import { COPY } from "@/lib/copy";

export const metadata: Metadata = {
  title: COPY.zh.meta.docsTitle,
  description: COPY.zh.meta.docsDescription,
  alternates: { canonical: "/zh/docs", languages: { en: "/docs", "zh-CN": "/zh/docs" } },
};

export default function DocsPage() {
  return <DocsView locale="zh" />;
}
