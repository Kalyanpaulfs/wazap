import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, MessageCircle, QrCode, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Free WhatsApp Business Tools — QR, Bulk Queue & Links",
  description: "Use 18 WhatsApp business tools for consent-based bulk chat queues, QR codes, links, insights, customer replies, routing and lead follow-up.",
  keywords: [
    "whatsapp tools", "free whatsapp tools", "whatsapp business tools",
    "whatsapp widget generator", "whatsapp click to chat", "whatsapp number formatter",
    "whatsapp qr code", "whatsapp linktree", "whatsapp link rotator",
    "click to whatsapp", "whatsapp marketing tools",
  ],
  alternates: { canonical: "https://wazap.lt/tools" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Free WhatsApp Tools — Wazap",
    description: "Click-to-chat WhatsApp tools. Widget, wa.me link formatter, ad builder, vCard, linktree, rotator and more.",
    url: "https://wazap.lt/tools",
  },
};

const toolsJsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Wazap WhatsApp Tools",
  description: "Free and pro WhatsApp tools for business and marketing",
  url: "https://wazap.lt/tools",
  numberOfItems: 18,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Consent-Based WhatsApp Bulk Sender", url: "https://wazap.lt/tools/bulk", description: "Prepare personalized chats and open them one at a time for human review and sending." },
    { "@type": "ListItem", position: 2, name: "WhatsApp Widget Generator", url: "https://wazap.lt/tools/widget", description: "Embed a WhatsApp chat button on any website with one line of code." },
    { "@type": "ListItem", position: 3, name: "WhatsApp Number Formatter", url: "https://wazap.lt/tools/checker", description: "Clean phone-number formats and generate wa.me click-to-chat links." },
    { "@type": "ListItem", position: 4, name: "Click-to-WhatsApp Ad Builder", url: "https://wazap.lt/tools/ad-builder", description: "Create UTM-tracked WhatsApp links for Facebook and Google ads." },
    { "@type": "ListItem", position: 5, name: "WhatsApp vCard + QR Generator", url: "https://wazap.lt/tools/vcard", description: "Generate a digital business card and WhatsApp QR code." },
    { "@type": "ListItem", position: 6, name: "WhatsApp Linktree", url: "https://wazap.lt/tools/linktree", description: "One page with multiple WhatsApp numbers for your team." },
    { "@type": "ListItem", position: 7, name: "WhatsApp Link Rotator", url: "https://wazap.lt/tools/rotator", description: "One link that rotates across multiple WhatsApp numbers automatically." },
    { "@type": "ListItem", position: 8, name: "WhatsApp Transcript Exporter", url: "https://wazap.lt/tools/transcript", description: "Format your WhatsApp .txt export into a clean printable PDF." },
    { "@type": "ListItem", position: 9, name: "WhatsApp QR Code Generator", url: "https://wazap.lt/qr", description: "Create a scannable WhatsApp QR code with a pre-filled message." },
    { "@type": "ListItem", position: 10, name: "WhatsApp Click-to-Chat Link Builder", url: "https://wazap.lt/tools/link", description: "Create a wa.me link, button snippet and markdown link." },
    { "@type": "ListItem", position: 11, name: "WhatsApp Message Templates", url: "https://wazap.lt/tools/templates", description: "Copy ready-to-use WhatsApp templates for sales, support and follow-up." },
    { "@type": "ListItem", position: 12, name: "WhatsApp Branded Short Links", url: "https://wazap.lt/tools/shortlink", description: "Create branded short links with click analytics." },
    { "@type": "ListItem", position: 13, name: "WhatsApp Catalog & Order Page", url: "https://wazap.lt/tools/catalog", description: "Publish a catalog where every item opens a WhatsApp order." },
    { "@type": "ListItem", position: 14, name: "WhatsApp Text Formatter", url: "https://wazap.lt/tools/formatter", description: "Format WhatsApp messages with bold, italic, strikethrough and monospace." },
    { "@type": "ListItem", position: 15, name: "WhatsApp Lead Follow-Up Tracker", url: "https://wazap.lt/tools/follow-up", description: "Track lead source, campaign, value and next follow-up date." },
    { "@type": "ListItem", position: 16, name: "WhatsApp Chat Insights", url: "https://wazap.lt/tools/chat-insights", description: "Analyze exported WhatsApp chats privately in your browser." },
    { "@type": "ListItem", position: 17, name: "WhatsApp Customer Reply Generator", url: "https://wazap.lt/tools/reply-generator", description: "Draft polished customer replies for sales and support." },
    { "@type": "ListItem", position: 18, name: "WhatsApp Message Scheduler", url: "https://wazap.lt/tools/message-scheduler", description: "Prepare messages and create calendar reminders to send them." },
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Are Wazap tools free?",
      acceptedAnswer: { "@type": "Answer", text: "Yes. Free accounts can try every active Wazap tool with fair usage limits. Paid plans increase limits and unlock unlimited access on supported tools." },
    },
    {
      "@type": "Question",
      name: "Do I need a WhatsApp Business account to use these tools?",
      acceptedAnswer: { "@type": "Answer", text: "No. All Wazap tools work with any regular WhatsApp number. No WhatsApp Business API access required." },
    },
    {
      "@type": "Question",
      name: "What is a WhatsApp widget?",
      acceptedAnswer: { "@type": "Answer", text: "A WhatsApp widget is a floating chat button you embed on your website. When visitors click it, it opens a WhatsApp chat with your number directly — no saving needed." },
    },
    {
      "@type": "Question",
      name: "How does the WhatsApp Link Rotator work?",
      acceptedAnswer: { "@type": "Answer", text: "You create one short link that automatically rotates between your team's WhatsApp numbers in round-robin order. Each visitor gets sent to a different agent, distributing leads evenly." },
    },
  ],
};

export default function ToolsPage() {
  const primaryTools = [
    { href: "/tools/link", icon: MessageCircle, title: "Open a WhatsApp chat", desc: "Message a number without saving it first.", action: "Open chat" },
    { href: "/qr", icon: QrCode, title: "Create a WhatsApp QR", desc: "Make a scannable code for a flyer, desk, or card.", action: "Create QR" },
    { href: "/tools/link", icon: Zap, title: "Build a WhatsApp link", desc: "Create a shareable wa.me link with a prepared message.", action: "Build link" },
    { href: "/tools/follow-up", icon: CalendarClock, title: "Follow up a lead", desc: "Save the lead and schedule the next action.", action: "Add lead" },
  ];
  const moreTools = [
    ["/tools/bulk", "Consent-based bulk queue", "Prepare personalized chats for human review."],
    ["/tools/widget", "Website chat widget", "Add a WhatsApp button to your site."],
    ["/tools/checker", "Number formatter", "Clean numbers and create click-to-chat links."],
    ["/tools/ad-builder", "Ad link builder", "Add campaign tracking to WhatsApp links."],
    ["/tools/vcard", "vCard generator", "Create a digital business card."],
    ["/tools/linktree", "Link page", "Put several WhatsApp contacts on one page."],
    ["/tools/rotator", "Lead rotator", "Share new chats across team numbers."],
    ["/tools/transcript", "Transcript exporter", "Format an exported chat for printing."],
    ["/tools/templates", "Message templates", "Use ready-made sales and support messages."],
    ["/tools/shortlink", "Tracked short links", "Create compact links with click counts."],
    ["/tools/catalog", "Catalog and order page", "Let customers start an order in WhatsApp."],
    ["/tools/formatter", "Text formatter", "Prepare bold, italic, and structured messages."],
    ["/tools/chat-insights", "Chat insights", "Analyze an exported chat in your browser."],
    ["/tools/reply-generator", "Reply generator", "Draft a clear customer response."],
    ["/tools/message-scheduler", "Message reminder", "Create a reminder for a future send."],
  ] as const;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(toolsJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="hero-bg min-h-[calc(100vh-56px)] px-4 py-12 sm:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-1.5 text-sm text-[#25D366] mb-4">
            Start with one job
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3">WhatsApp Tools</h1>
          <p className="mx-auto max-w-2xl text-slate-400 text-lg">Choose what you need now. The rest stays out of the way until you ask for it.</p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2">
          {primaryTools.map(({ href, icon: Icon, title, desc, action }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-slate-800 bg-[#111811] p-6 transition-all hover:border-[#25D366]/50 hover:bg-[#25D366]/10">
              <Icon className="mb-4 h-6 w-6 text-[#25D366]" />
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{desc}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#25D366]">{action} <ArrowRight className="h-4 w-4" /></span>
            </Link>
          ))}
        </div>

        <details className="mx-auto mt-8 max-w-5xl rounded-2xl border border-slate-800 bg-[#111811] p-5">
          <summary className="cursor-pointer list-none text-center text-sm font-semibold text-slate-300 hover:text-white">
            Show 15 more tools
          </summary>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {moreTools.map(([href, title, desc]) => (
              <Link key={href} href={href} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 transition-colors hover:border-[#25D366]/40">
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{desc}</p>
              </Link>
            ))}
          </div>
        </details>

        {/* SEO text content — visually hidden from layout but readable by Google */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              { q: "Are Wazap tools free?", a: "Yes. Free accounts can try every active tool with fair usage limits. Paid plans increase limits, remove widget branding, and unlock more pages, links and usage." },
              { q: "Do I need WhatsApp Business API?", a: "No. All Wazap tools work with any regular WhatsApp number on your phone. No WhatsApp Business API or special account needed." },
              { q: "Does the bulk sender automatically send messages?", a: "No. Wazap prepares a consent-based queue and opens each personalized chat for you. You review and tap Send inside WhatsApp, so no unofficial auto-sending or API connection is required." },
              { q: "How does the WhatsApp Link Rotator work?", a: "You add multiple team numbers and get one short link. Every visitor gets automatically routed to the next agent in round-robin order — evenly distributing leads across your whole team." },
              { q: "Can I embed a WhatsApp button on my website?", a: "Yes — the Widget Generator creates one line of HTML you paste before the closing body tag of any website. The floating button appears on every page and opens a WhatsApp chat with your number when clicked." },
            ].map(faq => (
              <div key={faq.q} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
                <h3 className="font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-800 px-4 py-8 text-center text-sm text-slate-600">
        <p>© 2026 Wazap.lt — Not affiliated with WhatsApp or Meta.</p>
      </footer>
    </>
  );
}
