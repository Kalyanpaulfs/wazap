import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import ProductLandingPage, { type ProductLandingContent } from "@/app/components/ProductLandingPage";

export const metadata: Metadata = {
  title: "WhatsApp Ad Tracking — See Which Ad Brings Clicks",
  description:
    "Create a tracked WhatsApp link per ad or campaign with source, medium and campaign fields, and see which ad brings clicks in Reports.",
  alternates: { canonical: "https://wazap.lt/whatsapp-ad-tracking" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "WhatsApp Ad Tracking — Wazap",
    description: "A tracked WhatsApp link per ad or campaign, so you can see which one brings clicks in Reports.",
    url: "https://wazap.lt/whatsapp-ad-tracking",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wazap WhatsApp Ad Link Builder",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://wazap.lt/whatsapp-ad-tracking",
  description: "A tracked WhatsApp link per ad or campaign with source, medium and campaign fields, so you can see which ad or campaign brings clicks in Reports.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const content: ProductLandingContent = {
  art: { src: "/art/products/product-ad-tracking.webp", alt: "A megaphone sending a tracked trail into an analytics card" },
  icon: Megaphone,
  eyebrow: "WhatsApp ad tracking",
  h1: "See which ad brings",
  h1Highlight: "WhatsApp clicks",
  intro:
    "Build a tracked WhatsApp link for each ad or campaign, with source, medium and campaign fields. Use it in your ad instead of a plain number, then check Reports to see which one is working.",
  toolHref: "/tools/ad-builder",
  toolLabel: "Ad link builder",
  highlight: "adLinks",
  whoFor: [
    { title: "E-commerce shops running ads", text: "Tag each Facebook or Google campaign with its own link and see which one actually brings clicks." },
    { title: "Agencies managing client campaigns", text: "Give each client's campaign a separate tracked link so results are easy to report on." },
    { title: "Real-estate teams testing listings", text: "Track which listing or channel brings in enquiries, instead of guessing from one shared number." },
    { title: "Local businesses comparing channels", text: "Compare a flyer link against an online ad link to see which one actually drives clicks." },
  ],
  steps: [
    { title: "Create a tracked link", text: "Build a WhatsApp link for the ad or campaign, with source, medium and campaign fields filled in." },
    { title: "Use it in the ad", text: "Put the tracked link in the ad or campaign instead of a plain WhatsApp number or generic link." },
    { title: "Check Reports", text: "Open Reports to see which ad or campaign is bringing in clicks, so you know where to spend next." },
  ],
  benefits: [
    "Know which ad or campaign is actually bringing in clicks.",
    "Compare campaigns side by side with source, medium and campaign fields.",
    "Stop guessing where ad spend is working and where it isn't.",
    "Reports with date range on Growth and Agency plans for ongoing tracking.",
    "Works alongside the free WhatsApp link builder and QR maker for anything not tied to a specific campaign.",
  ],
  qa: [
    { q: "How many ad links can I create?", a: "Ad links start on Growth ($19) and Agency ($49). They share your link total with rotators and brand links: 20 links on Growth, 55 on Agency. Solo doesn't include ad links." },
    { q: "What do source, medium and campaign mean?", a: "They're the fields you fill in when creating the link — for example source=facebook, medium=cpc, campaign=summer-sale — so Reports can tell campaigns apart." },
    { q: "Can I see full reports with dates?", a: "Growth and Agency include full reports with sources, campaigns and a date range. Solo includes basic reports; Free doesn't include reports." },
    { q: "Does this replace my ad platform's own analytics?", a: "No — it tracks what happens after someone clicks through to WhatsApp, which your ad platform usually can't see." },
  ],
  crossLinks: [
    { href: "/whatsapp-lead-routing", title: "WhatsApp lead routing", text: "Share incoming clicks across your team in turn." },
    { href: "/whatsapp-short-links", title: "WhatsApp short links", text: "A short, branded link with click counts." },
    { href: "/whatsapp-website-widget", title: "Website chat widget", text: "Add a WhatsApp button to your website." },
  ],
};

export default function WhatsAppAdTrackingPage() {
  return (
    <>
      <script id="ad-tracking-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductLandingPage content={content} />
    </>
  );
}
