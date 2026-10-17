import type { Metadata } from "next";
import { Route } from "lucide-react";
import ProductLandingPage, { type ProductLandingContent } from "@/app/components/ProductLandingPage";

export const metadata: Metadata = {
  title: "WhatsApp Lead Routing — Share Chats Across Your Team | Wazap",
  description:
    "Route incoming WhatsApp chats to your sales team in turn with one link and QR code. Round-robin distribution, a fallback number, per-salesperson click counts, and bot protection.",
  alternates: { canonical: "https://wazap.lt/whatsapp-lead-routing" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "WhatsApp Lead Routing — Wazap",
    description: "One WhatsApp link that shares incoming chats across your team in turn, with a fallback number and per-salesperson counts.",
    url: "https://wazap.lt/whatsapp-lead-routing",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wazap WhatsApp Lead Rotator",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://wazap.lt/whatsapp-lead-routing",
  description: "One WhatsApp link and QR code that shares incoming chats across team salespeople in turn (round-robin), with a fallback number and per-salesperson click counts.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const content: ProductLandingContent = {
  icon: Route,
  eyebrow: "WhatsApp lead routing",
  h1: "Route every WhatsApp lead to the",
  h1Highlight: "right salesperson",
  intro:
    "Share one WhatsApp link and QR code. Each new chat is shared across your team's numbers in turn (round-robin), with a fallback number if someone's unavailable, so no lead sits with just one person.",
  toolHref: "/tools/rotator",
  toolLabel: "Lead rotator",
  highlight: "rotator",
  whoFor: [
    { title: "Real-estate teams", text: "Put one link on every listing instead of a different agent's number on each one, and share the viewing requests evenly." },
    { title: "Clinics with several doctors", text: "One number for the front desk, enquiries shared across the doctors or staff who are available to answer." },
    { title: "Agencies managing several accounts", text: "Give each client campaign its own rotator so enquiries reach whoever is handling that account." },
    { title: "E-commerce shops with a sales team", text: "Spread order questions across the team taking orders over WhatsApp instead of one overloaded number." },
  ],
  steps: [
    { title: "Add your team's numbers", text: "Create a rotator link and QR code, then add the WhatsApp numbers of the salespeople who should receive chats, plus a fallback number." },
    { title: "Share one link everywhere", text: "Use the same link and QR code on your website, ads, listings or print. Each new chat is handed to the next salesperson in turn." },
    { title: "Watch the counts", text: "See click and chat counts per salesperson. Bot protection stops repeated clicks from one device from counting more than once." },
  ],
  benefits: [
    "One link and QR code to share everywhere, instead of juggling several numbers.",
    "Fair round-robin distribution keeps leads from piling up with one person.",
    "A fallback number keeps a chat from being lost when someone's unavailable.",
    "Per-salesperson click and chat counts show who's actually getting the work.",
    "Bot protection keeps the counts accurate by not counting repeated clicks from one device.",
    "Works from a free account — no card needed to try it.",
  ],
  qa: [
    { q: "How many rotators can I create?", a: "Your 3-day free trial includes 3 rotators with up to 3 salespeople each — the same as Solo. Solo ($9) keeps that ongoing, Growth ($19) includes 10 rotators with up to 10 salespeople each, and Agency ($49) includes 25 rotators with up to 20 salespeople each." },
    { q: "Does Wazap read the WhatsApp messages?", a: "No. Wazap routes the click to the right WhatsApp number — it doesn't read or store the conversation that follows." },
    { q: "What happens if a salesperson is unavailable?", a: "Set a fallback number on the rotator. Routing is based on configured numbers, not on whether someone is actually online to reply." },
    { q: "Is there a free trial?", a: "Yes — new accounts get a 3-day free trial with everything in Solo, including 100 routed leads, with no card required." },
  ],
  crossLinks: [
    { href: "/whatsapp-ad-tracking", title: "WhatsApp ad tracking", text: "See which ad or campaign is bringing in chats." },
    { href: "/whatsapp-short-links", title: "WhatsApp short links", text: "A short, branded link with click counts." },
    { href: "/whatsapp-website-widget", title: "Website chat widget", text: "Add a WhatsApp button to your website." },
  ],
};

export default function WhatsAppLeadRoutingPage() {
  return (
    <>
      <script id="lead-routing-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductLandingPage content={content} />
    </>
  );
}
