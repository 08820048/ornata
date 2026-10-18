import type { Metadata } from "next";
import { DocsView } from "@/components/docs/DocsView";
import { COPY } from "@/lib/copy";

export const metadata: Metadata = {
  title: COPY.en.meta.docsTitle,
  description: COPY.en.meta.docsDescription,
  alternates: { canonical: "/docs", languages: { en: "/docs", "zh-CN": "/zh/docs" } },
};

export default function DocsPage() {
  return <DocsView locale="en" />;
}
