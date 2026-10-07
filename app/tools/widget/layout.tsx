import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "Free WhatsApp Widget Generator for Websites",
  description: "Generate a floating WhatsApp chat button for your website in seconds. Customise colour, position and label. Copy one line of code and paste it anywhere. 100% free.",
  keywords: ["whatsapp widget", "whatsapp chat button website", "embed whatsapp button", "whatsapp website widget", "click to chat whatsapp", "free whatsapp button"],
  alternates: { canonical: "https://wazap.lt/tools/widget" },
  openGraph: { title: "Free WhatsApp Widget Generator — Wazap", description: "Add a floating WhatsApp button to any website with one line of code. Free, customisable, instant.", url: "https://wazap.lt/tools/widget" },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication",
  name: "WhatsApp Widget Generator", applicationCategory: "BusinessApplication",
  url: "https://wazap.lt/tools/widget", operatingSystem: "Web",
  description: "Generate embeddable WhatsApp chat buttons for websites. Free forever.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />{children}<ToolSeo k="widget" /></>;
}
