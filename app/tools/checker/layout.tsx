import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "WhatsApp Number Checker & Formatter — Free Tool",
  description: "Check and clean international phone-number formatting, then create direct wa.me links. Free WhatsApp number formatter with no account required.",
  keywords: ["whatsapp number checker", "validate whatsapp numbers", "check whatsapp number online", "whatsapp number validator", "wa.me link generator"],
  alternates: { canonical: "https://wazap.lt/tools/checker" },
  robots: { index: true, follow: true },
  openGraph: { title: "WhatsApp Number Formatter — Wazap", description: "Clean international number formats and generate direct wa.me links without claiming account verification.", url: "https://wazap.lt/tools/checker" },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication",
  name: "WhatsApp Number Formatter", applicationCategory: "BusinessApplication",
  url: "https://wazap.lt/tools/checker", operatingSystem: "Web",
  description: "Validate and format WhatsApp phone numbers. Generate direct wa.me links.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />{children}<ToolSeo k="checker" /></>;
}
