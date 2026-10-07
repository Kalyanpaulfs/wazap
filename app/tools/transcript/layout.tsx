import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "WhatsApp Chat Transcript & PDF Exporter",
  description: "Convert a WhatsApp .txt export into a clean, readable transcript. Print it to PDF or save HTML for business archives, records and support logs.",
  keywords: ["whatsapp transcript exporter", "whatsapp chat to pdf", "export whatsapp chat history", "whatsapp chat formatter", "whatsapp txt to pdf", "whatsapp conversation export"],
  alternates: { canonical: "https://wazap.lt/tools/transcript" },
  openGraph: { title: "WhatsApp Transcript Exporter — Clean Chat PDF — Wazap", description: "Turn your WhatsApp .txt export into a clean printable transcript. Perfect for records, legal use, and archives.", url: "https://wazap.lt/tools/transcript" },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication",
  name: "WhatsApp Transcript Exporter", applicationCategory: "BusinessApplication",
  url: "https://wazap.lt/tools/transcript", operatingSystem: "Web",
  description: "Format WhatsApp .txt exports into clean printable PDF transcripts.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />{children}<ToolSeo k="transcript" /></>;
}
