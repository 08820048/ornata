import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { FeaturesBento } from "@/components/FeaturesBento";
import { AgentBridge } from "@/components/AgentBridge";
import { AgentTrace } from "@/components/AgentTrace";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";
import { DownloadModal } from "@/components/DownloadModal";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "https://ornata.app" },
};

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <FeaturesBento />
        <AgentTrace />
        <AgentBridge />
        <Faq />
      </main>
      <Footer />
      <DownloadModal />
    </>
  );
}
