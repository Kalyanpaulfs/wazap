import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: 'WhatsApp Text Formatter — Bold, Italic, Strikethrough',
  description: 'Format WhatsApp messages with bold, italic, strikethrough and monospace, with a live preview. No need to remember the symbols.',
  keywords: ['whatsapp text formatter', 'whatsapp bold text', 'whatsapp italic', 'whatsapp font generator', 'whatsapp formatting', 'whatsapp strikethrough'],
  alternates: { canonical: 'https://wazap.lt/tools/formatter' },
  openGraph: { title: 'WhatsApp Text Formatter — Bold, Italic, Strikethrough — Wazap', description: 'Format WhatsApp messages with bold, italic, strikethrough and monospace, with a live preview. No need to remember the symbols.', url: 'https://wazap.lt/tools/formatter' },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication",
  name: "WhatsApp Text Formatter", applicationCategory: "BusinessApplication", url: "https://wazap.lt/tools/formatter", operatingSystem: "Web",
  description: "Format WhatsApp messages with bold, italic, strikethrough and monospace with a live preview.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />{children}<ToolSeo k="formatter" /></>;
}
