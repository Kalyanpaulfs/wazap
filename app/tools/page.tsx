import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Code2, Link2, Megaphone, MessageCircle, QrCode, RefreshCw } from "lucide-react";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "WhatsApp Business Tools — QR, Links & Routing",
  description: "Use Wazap's WhatsApp business tools for click-to-chat links, QR codes, ad tracking and lead routing.",
  keywords: [
    "whatsapp tools", "free whatsapp tools", "whatsapp business tools",
    "whatsapp widget generator", "whatsapp click to chat", "whatsapp number formatter",
    "whatsapp qr code", "whatsapp link rotator",
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
  numberOfItems: 6,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "WhatsApp Widget Generator", url: "https://wazap.lt/tools/widget", description: "Embed a WhatsApp chat button on any website with one line of code." },
    { "@type": "ListItem", position: 2, name: "Click-to-WhatsApp Ad Builder", url: "https://wazap.lt/tools/ad-builder", description: "Create UTM-tracked WhatsApp links for Facebook and Google ads." },
    { "@type": "ListItem", position: 3, name: "WhatsApp Link Rotator", url: "https://wazap.lt/tools/rotator", description: "One link that rotates click-to-chat handoffs across configured team numbers." },
    { "@type": "ListItem", position: 4, name: "WhatsApp QR Code Generator", url: "https://wazap.lt/qr", description: "Create a scannable WhatsApp QR code with a pre-filled message." },
    { "@type": "ListItem", position: 5, name: "WhatsApp Click-to-Chat Link Builder", url: "https://wazap.lt/tools/link", description: "Create a wa.me link, button snippet and markdown link." },
    { "@type": "ListItem", position: 6, name: "WhatsApp Branded Short Links", url: "https://wazap.lt/tools/shortlink", description: "Create branded short links with click analytics." },
  ],
};

// UX-1 step 5: the tools hub sends logged-in users straight into the new
// in-app create flow. This redirect lives on the page itself (not a
// app/tools/layout.tsx) so it does NOT also wrap /tools/widget or the other
// /tools/* subpages, which must stay reachable for logged-in users.
export default async function ToolsPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/links/new");

  const tools = [
    { href: "/tools/rotator", icon: RefreshCw, title: "Lead rotator", desc: "One link that shares chats across your team's numbers.", action: "Create rotator" },
    { href: "/tools/ad-builder", icon: Megaphone, title: "Ad link builder", desc: "Track which ad or campaign brings WhatsApp chats.", action: "Build ad link" },
    { href: "/tools/shortlink", icon: Link2, title: "Tracked short links", desc: "A short custom link with click counts.", action: "Create short link" },
    { href: "/tools/widget", icon: Code2, title: "Website chat widget", desc: "Add a WhatsApp button to your website.", action: "Get widget" },
    { href: "/tools/link", icon: MessageCircle, title: "WhatsApp link builder", desc: "A simple wa.me link for one number, with a ready message.", action: "Build link" },
    { href: "/qr", icon: QrCode, title: "WhatsApp QR maker", desc: "A scannable code for a flyer, desk, or card.", action: "Create QR" },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(toolsJsonLd) }} />

      <div className="hero-bg min-h-[calc(100vh-56px)] px-4 py-12 sm:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-1.5 text-sm text-[#25D366] mb-4">
            Start with one job
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3">WhatsApp Tools</h1>
          <p className="mx-auto max-w-2xl text-slate-400 text-lg">Share WhatsApp chats across your team, track your links, and add WhatsApp to your website. Choose a tool below.</p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map(({ href, icon: Icon, title, desc, action }) => (
            <Link key={title} href={href} className="group rounded-2xl border border-slate-800 bg-[#111811] p-6 transition-all hover:border-[#25D366]/50 hover:bg-[#25D366]/10">
              <Icon className="mb-4 h-6 w-6 text-[#25D366]" />
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{desc}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#25D366]">{action} <ArrowRight className="h-4 w-4" /></span>
            </Link>
          ))}
        </div>
      </div>

      <footer className="border-t border-slate-800 px-4 py-8 text-center text-sm text-slate-600">
        <p>© 2026 Wazap.lt — Not affiliated with WhatsApp or Meta.</p>
      </footer>
    </>
  );
}
