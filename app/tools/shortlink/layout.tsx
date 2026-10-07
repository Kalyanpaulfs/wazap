import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: 'WhatsApp Branded Short Links + Click Analytics',
  description: 'Create branded wazap.lt/w/ links that open a WhatsApp chat and track every click. Custom slug, pre-filled message, live analytics.',
  keywords: ['whatsapp short link', 'branded whatsapp link', 'whatsapp link with tracking', 'whatsapp link analytics', 'custom wa.me link', 'whatsapp bio link'],
  alternates: { canonical: 'https://wazap.lt/tools/shortlink' },
  openGraph: { title: 'WhatsApp Branded Short Links + Click Analytics — Wazap', description: 'Create branded wazap.lt/w/ links that open a WhatsApp chat and track every click. Custom slug, pre-filled message, live analytics.', url: 'https://wazap.lt/tools/shortlink' },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication",
  name: "WhatsApp Branded Short Links", applicationCategory: "BusinessApplication", url: "https://wazap.lt/tools/shortlink", operatingSystem: "Web",
  description: "Branded, trackable short links that open a WhatsApp chat, with live click analytics.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />{children}<ToolSeo k="shortlink" /></>;
}
