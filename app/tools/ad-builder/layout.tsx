import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "WhatsApp Ad Link Builder with UTM Tracking",
  description: "Create UTM-tagged WhatsApp links for Facebook and Google ads. Track clicks in one dashboard and identify which campaigns start conversations.",
  keywords: ["click to whatsapp ads", "whatsapp utm link generator", "whatsapp ad tracking", "facebook click to whatsapp", "whatsapp campaign tracker", "google ads whatsapp"],
  alternates: { canonical: "https://wazap.lt/tools/ad-builder" },
  openGraph: { title: "WhatsApp Ad Link Builder with Click Tracking — Wazap", description: "Track every click on your WhatsApp ad links. UTM tagging, click dashboard, multiple campaigns.", url: "https://wazap.lt/tools/ad-builder" },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication",
  name: "Click-to-WhatsApp Ad Builder", applicationCategory: "MarketingApplication",
  url: "https://wazap.lt/tools/ad-builder", operatingSystem: "Web",
  description: "UTM-tracked WhatsApp links for Facebook and Google ads with click analytics dashboard.",
  offers: { "@type": "AggregateOffer", lowPrice: "19.00", highPrice: "99.00", priceCurrency: "USD" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />{children}<ToolSeo k="ad-builder" /></>;
}
