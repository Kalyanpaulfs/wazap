import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { ArrowRight, Code2, Link2, Megaphone, MessageCircle, QrCode, RefreshCw, Type } from "lucide-react";
import { authOptions } from "@/lib/auth";
import AllTools from "./AllTools";

export const metadata: Metadata = {
  title: "WhatsApp Business Tools — QR, Links & Routing",
  description: "Use Wazap's WhatsApp business tools for click-to-chat links, QR codes, ad tracking and lead routing.",
  keywords: [
    "whatsapp tools", "free whatsapp tools", "whatsapp business tools",
    "whatsapp widget generator", "whatsapp click to chat", "whatsapp number formatter",
    "whatsapp qr code", "whatsapp link rotator", "whatsapp text formatter",
    "click to whatsapp", "whatsapp marketing tools",
  ],
  alternates: { canonical: "https://wazap.lt/tools" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "WhatsApp Business Tools — Wazap",
    description: "Click-to-chat WhatsApp tools. Widget, ad builder, rotator and more.",
    url: "https://wazap.lt/tools",
  },
};

const toolsJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Wazap WhatsApp Tools",
  description: "WhatsApp tools with free trials and plan-based allowances",
  url: "https://wazap.lt/tools",
  numberOfItems: 7,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "WhatsApp Widget Generator", url: "https://wazap.lt/tools/widget", description: "Embed a WhatsApp chat button on any website with one line of code." },
    { "@type": "ListItem", position: 2, name: "Click-to-WhatsApp Ad Builder", url: "https://wazap.lt/tools/ad-builder", description: "Create UTM-tracked WhatsApp links for Facebook and Google ads." },
    { "@type": "ListItem", position: 3, name: "WhatsApp Link Rotator", url: "https://wazap.lt/tools/rotator", description: "One link that rotates click-to-chat handoffs across configured team numbers." },
    { "@type": "ListItem", position: 4, name: "WhatsApp QR Code Generator", url: "https://wazap.lt/qr", description: "Create a scannable WhatsApp QR code with a pre-filled message." },
    { "@type": "ListItem", position: 5, name: "WhatsApp Click-to-Chat Link Builder", url: "https://wazap.lt/tools/link", description: "Create a wa.me link, button snippet and markdown link." },
    { "@type": "ListItem", position: 6, name: "WhatsApp Branded Short Links", url: "https://wazap.lt/tools/shortlink", description: "Create branded short links with click analytics." },
    { "@type": "ListItem", position: 7, name: "WhatsApp Text Formatter", url: "https://wazap.lt/tools/formatter", description: "Add bold, italic, strikethrough and monospace to WhatsApp messages." },
  ],
};

// Logged-in customers get the "All tools" page (AllTools.tsx) instead of
// this public SEO page - decided on the page itself (not
// app/tools/layout.tsx), so it does NOT also affect /tools/widget or the
// other /tools/* subpages, which keep their own logged-in behaviour.
// Logged-out visitors keep seeing exactly the public content below.
export default async function ToolsPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) return <AllTools userId={(session.user as { id: string }).id} />;

  const tools = [
    { href: "/tools/rotator", icon: RefreshCw, title: "Lead rotator", desc: "One link that shares clicks across your team's numbers.", action: "Create rotator" },
    { href: "/tools/ad-builder", icon: Megaphone, title: "Ad link builder", desc: "Track which ad or campaign brings WhatsApp clicks.", action: "Build ad link" },
    { href: "/tools/shortlink", icon: Link2, title: "Tracked short links", desc: "A short custom link with click counts.", action: "Create short link" },
    { href: "/tools/widget", icon: Code2, title: "Website chat widget", desc: "Add a WhatsApp button to your website.", action: "Get widget" },
    { href: "/tools/link", icon: MessageCircle, title: "WhatsApp link builder", desc: "A simple wa.me link for one number, with a ready message.", action: "Build link" },
    { href: "/qr", icon: QrCode, title: "WhatsApp QR maker", desc: "A scannable code for a flyer, desk, or card.", action: "Create QR" },
    { href: "/tools/formatter", icon: Type, title: "WhatsApp text formatter", desc: "Bold, italic and more for your WhatsApp messages.", action: "Format text" },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(toolsJsonLd) }} />

      <div className="min-h-[calc(100vh-56px)] px-4 py-12 sm:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-4 py-1.5 text-sm text-accent mb-4">
            Start with one job
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-text mb-3">WhatsApp Tools</h1>
          <p className="mx-auto max-w-2xl text-muted text-lg">Share WhatsApp clicks across your team, track your links, and add WhatsApp to your website. Choose a tool below.</p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map(({ href, icon: Icon, title, desc, action }) => (
            <Link key={title} href={href} className="group rounded-2xl border border-border bg-surface p-6 transition-all hover:border-accent/50 hover:bg-accent-soft">
              <Icon className="mb-4 h-6 w-6 text-accent" />
              <h2 className="text-lg font-semibold text-text">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{desc}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent">{action} <ArrowRight className="h-4 w-4" /></span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
