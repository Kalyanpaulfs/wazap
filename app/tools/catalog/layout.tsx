import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: 'WhatsApp Catalog & Order Page Builder',
  description: 'Publish a shareable WhatsApp catalog / order page. Every product has an Order-on-WhatsApp button with a pre-filled order.',
  keywords: ['whatsapp catalog', 'whatsapp order page', 'sell on whatsapp', 'whatsapp store page', 'whatsapp product catalog', 'order via whatsapp'],
  alternates: { canonical: 'https://wazap.lt/tools/catalog' },
  openGraph: { title: 'WhatsApp Catalog & Order Page Builder — Wazap', description: 'Publish a shareable WhatsApp catalog / order page. Every product has an Order-on-WhatsApp button with a pre-filled order.', url: 'https://wazap.lt/tools/catalog' },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication",
  name: "WhatsApp Catalog & Order Page", applicationCategory: "BusinessApplication", url: "https://wazap.lt/tools/catalog", operatingSystem: "Web",
  description: "A shareable product/service catalog page where each item opens a pre-filled WhatsApp order.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />{children}<ToolSeo k="catalog" /></>;
}
