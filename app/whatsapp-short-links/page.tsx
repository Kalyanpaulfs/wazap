import type { Metadata } from "next";
import { Link2 } from "lucide-react";
import ProductLandingPage, { type ProductLandingContent } from "@/app/components/ProductLandingPage";

export const metadata: Metadata = {
  title: "WhatsApp Short Links — Custom Slug, Click Counts | Wazap",
  description:
    "Create a short, custom WhatsApp link with your own slug and click counts, instead of a long wa.me link.",
  alternates: { canonical: "https://wazap.lt/whatsapp-short-links" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "WhatsApp Short Links — Wazap",
    description: "A short custom link to a WhatsApp chat, with click counts.",
    url: "https://wazap.lt/whatsapp-short-links",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wazap WhatsApp Short Links",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://wazap.lt/whatsapp-short-links",
  description: "Short custom links (with a custom slug) to a WhatsApp chat, with click counts.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const content: ProductLandingContent = {
  art: { src: "/art/products/product-short-links.webp", alt: "A long tangled chain becoming one short neat link with a click counter" },
  icon: Link2,
  eyebrow: "WhatsApp short links",
  h1: "Short, branded WhatsApp links with",
  h1Highlight: "click counts",
  intro:
    "Pick a custom slug, point it at your WhatsApp number and message, and share a short link instead of a long wa.me address — with click counts so you know it's being used.",
  toolHref: "/tools/shortlink",
  toolLabel: "Short link builder",
  highlight: "shortLinks",
  whoFor: [
    { title: "Businesses printing a link", text: "A short, clean link reads better on packaging, signage and business cards than a long wa.me address." },
    { title: "Agencies sharing links with clients", text: "Hand clients a tidy short link instead of a long one with a country code and message text baked in." },
    { title: "Shops running short promotions", text: "Use a slug that matches the promotion, like a sale name, so the link itself is easy to remember." },
    { title: "Teams that want a memorable slug", text: "Swap a long wa.me link for something short and readable, without losing the message pre-fill." },
  ],
  steps: [
    { title: "Pick a custom slug", text: "Choose the short, memorable slug that will sit at the end of your Wazap short link." },
    { title: "Point it at your number", text: "Set the WhatsApp number and optional pre-filled message the short link should open." },
    { title: "Share and track clicks", text: "Put the short link anywhere — print, social, email — and see click counts over time." },
  ],
  benefits: [
    "A short, memorable slug instead of a long wa.me link with a message baked in.",
    "Click counts show whether the link is actually being used.",
    "Reads cleanly on packaging, signage, business cards and social bios.",
    "No extra app for the customer — it still opens a normal WhatsApp chat.",
  ],
  qa: [
    { q: "How many short links can I create?", a: "Short links share one link total with rotators and ad links. Your 3-day free trial includes 5 links — the same as Solo. Solo ($9) keeps that ongoing, Growth ($19) includes 20 links, and Agency ($49) includes 55 links." },
    { q: "Can I choose my own slug?", a: "Yes — you pick the custom slug when you create the short link." },
    { q: "Does a short link expire?", a: "No, it keeps working as long as the link exists on your account and the destination number is set." },
    { q: "Is this different from the free link builder?", a: "Yes. The WhatsApp link builder at /tools/link is for a trial or active plan, and gives you a tracked WhatsApp link; only the QR maker at /qr stays free once a trial ends. Short links add a custom slug and click counts, and are included from the Solo plan." },
  ],
  crossLinks: [
    { href: "/whatsapp-lead-routing", title: "WhatsApp lead routing", text: "Share incoming chats across your team in turn." },
    { href: "/whatsapp-ad-tracking", title: "WhatsApp ad tracking", text: "See which ad or campaign is bringing in chats." },
    { href: "/whatsapp-website-widget", title: "Website chat widget", text: "Add a WhatsApp button to your website." },
  ],
};

export default function WhatsAppShortLinksPage() {
  return (
    <>
      <script id="short-links-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductLandingPage content={content} />
    </>
  );
}
