import type { Metadata } from "next";
import { Code2 } from "lucide-react";
import ProductLandingPage, { type ProductLandingContent } from "@/app/components/ProductLandingPage";

export const metadata: Metadata = {
  title: "WhatsApp Website Widget — Chat Button for Your Site | Wazap",
  description:
    "Add a WhatsApp chat button to your website. Choose the colour, position and label, then copy one embed snippet.",
  alternates: { canonical: "https://wazap.lt/whatsapp-website-widget" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "WhatsApp Website Widget — Wazap",
    description: "A WhatsApp chat button for your website, with your own colour, position and label.",
    url: "https://wazap.lt/whatsapp-website-widget",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Wazap WhatsApp Website Widget",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://wazap.lt/whatsapp-website-widget",
  description: "A WhatsApp chat button for your website. Choose colour, position and label, then copy one embed snippet.",
  offers: { "@type": "Offer", price: "9", priceCurrency: "USD" },
};

const content: ProductLandingContent = {
  art: { src: "/art/products/product-website-widget.webp", alt: "A website with a floating WhatsApp chat button" },
  icon: Code2,
  eyebrow: "WhatsApp website widget",
  h1: "Add a WhatsApp chat button to",
  h1Highlight: "your website",
  intro:
    "Choose a colour, position and label for a WhatsApp chat button, preview it, then copy one embed snippet into your website — so visitors can start a chat without typing your number.",
  toolHref: "/tools/widget",
  toolLabel: "Website widget",
  highlight: "widget",
  whoFor: [
    { title: "E-commerce shops", text: "Give visitors an easy way to ask about an order or product without leaving the page to find your number." },
    { title: "Clinics and service businesses", text: "Add a chat button so visitors can ask about appointments or services directly from your site." },
    { title: "Agencies building landing pages", text: "Drop one embed snippet into a client's landing page so campaign traffic can start a chat straight away." },
    { title: "Any website wanting a chat option", text: "Replace a plain contact link with a visible button that opens WhatsApp in one click." },
  ],
  steps: [
    { title: "Choose your look", text: "Pick the WhatsApp number, button colour, position on the page, and label text." },
    { title: "Preview the button", text: "Check how it looks and where it sits on the page before publishing." },
    { title: "Copy the embed snippet", text: "Copy one snippet and paste it into your website's code — no separate app or plugin needed." },
  ],
  benefits: [
    "Visitors start a WhatsApp chat in one click, without typing your number.",
    "Match the button colour, position and label to your site's look.",
    "One embed snippet works on most websites and page builders.",
    "No app for visitors to install — it opens a normal WhatsApp chat.",
  ],
  qa: [
    { q: "Which plans include the widget?", a: "The widget is included during your 3-day free trial and on every paid plan — Solo ($9), Growth ($19) and Agency ($49). It isn't available if your trial has ended and you haven't chosen a plan." },
    { q: "Will the widget slow down my site?", a: "The embed snippet is a small piece of code — it doesn't require installing a separate app." },
    { q: "Can I change the colour and position later?", a: "Yes — update the settings and copy the new embed snippet into your site." },
    { q: "Does the button work on mobile?", a: "Yes — tapping it opens a WhatsApp chat on mobile just as clicking it does on desktop." },
  ],
  crossLinks: [
    { href: "/whatsapp-lead-routing", title: "WhatsApp lead routing", text: "Share incoming chats across your team in turn." },
    { href: "/whatsapp-ad-tracking", title: "WhatsApp ad tracking", text: "See which ad or campaign is bringing in chats." },
    { href: "/whatsapp-short-links", title: "WhatsApp short links", text: "A short, branded link with click counts." },
  ],
};

export default function WhatsAppWebsiteWidgetPage() {
  return (
    <>
      <script id="website-widget-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductLandingPage content={content} />
    </>
  );
}
