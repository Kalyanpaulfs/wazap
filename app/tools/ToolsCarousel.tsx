"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight, CalendarClock, Check, BarChart3, MessageSquareText, Clock3 } from "lucide-react";
import {
  IconWidget, IconBulk, IconChecker, IconAdBuilder,
  IconVCard, IconLinktree, IconRotator, IconTranscript,
  IconUser, IconSend, IconQR,
} from "./ToolIcons";
import { TOOL_LIMITS } from "@/lib/tool-access";

const GREEN = "#25D366";

const TOOLS = [
  {
    key: "bulk",
    href: "/tools/bulk",
    Icon: IconBulk,
    name: "Consent-Based Bulk Sender",
    tagline: "No API required",
    desc: "Paste or import opted-in contacts locally, personalize a message and open each WhatsApp chat for human review.",
    features: ["CSV/TXT import", "{name} personalization", "One-click next chat", "Consent confirmation"],
    accessKey: "bulk" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "leads",
    href: "/tools/follow-up",
    Icon: CalendarClock,
    name: "Lead Follow-Up",
    tagline: "Never lose a warm lead",
    desc: "Track source, campaign, value and next action in a daily WhatsApp follow-up queue that turns clicks into sales.",
    features: ["Today + overdue queue", "Campaign and source tracking", "Deal status and value", "One-tap WhatsApp follow-up"],
    accessKey: "leads" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "widget",
    href: "/tools/widget",
    Icon: IconWidget,
    name: "Widget Generator",
    tagline: "Viral by nature",
    desc: "Embed a floating WhatsApp chat button on any website with one line of code. Every site using it sends visitors straight to your WhatsApp.",
    features: ["One-line embed code", "Custom colour & position", "Label bubble text", "Remove Wazap branding on paid"],
    accessKey: "widget" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "checker",
    href: "/tools/checker",
    Icon: IconChecker,
    name: "Number Formatter",
    tagline: "Clean phone-number formats",
    desc: "Paste up to 500 phone numbers. Instantly validate format, generate direct wa.me links and copy them all in one click.",
    features: ["Up to 500 numbers", "Format validation", "Direct wa.me links", "Copy all valid links"],
    accessKey: "checker" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "adBuilder",
    href: "/tools/ad-builder",
    Icon: IconAdBuilder,
    name: "Ad Link Builder",
    tagline: "Track every click",
    desc: "Create UTM-tagged WhatsApp links for your Facebook and Google ads. See exactly how many clicks each campaign drives.",
    features: ["UTM source/medium/campaign", "Click analytics dashboard", "Pre-filled messages", "Multiple campaigns"],
    accessKey: "adBuilder" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "vcard",
    href: "/tools/vcard",
    Icon: IconVCard,
    name: "vCard + QR Pack",
    tagline: "Your digital business card",
    desc: "Enter your details and download a .vcf digital business card and a custom-coloured QR code that opens WhatsApp directly.",
    features: [".vcf download", "Custom QR colour", "Name, company, title", "Opens WhatsApp directly"],
    accessKey: "vcard" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "linktree",
    href: "/tools/linktree",
    Icon: IconLinktree,
    name: "WhatsApp Linktree",
    tagline: "One link, your whole team",
    desc: "Create a branded page with multiple WhatsApp numbers — for sales teams, languages, or departments. One shareable link.",
    features: ["Custom slug URL", "Multiple WA numbers", "Brand colour", "View count tracking"],
    accessKey: "linktree" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "rotator",
    href: "/tools/rotator",
    Icon: IconRotator,
    name: "Link Rotator",
    tagline: "Distribute leads evenly",
    desc: "One short link that automatically rotates across your team's WhatsApp numbers in round-robin order. No more one agent getting all leads.",
    features: ["Round-robin rotation", "Unlimited numbers", "Click counter", "Instant short link"],
    accessKey: "rotator" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "transcript",
    href: "/tools/transcript",
    Icon: IconTranscript,
    name: "Transcript Exporter",
    tagline: "Clean chat records",
    desc: "Upload your WhatsApp .txt export and get a clean, readable transcript you can print or save as PDF. Perfect for business records.",
    features: ["WhatsApp .txt export", "Clean bubble layout", "Print to PDF", "Choose your side"],
    accessKey: "transcript" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "qr",
    href: "/qr",
    Icon: IconQR,
    name: "QR Generator",
    tagline: "Scan to chat",
    desc: "Create a custom WhatsApp QR code for any number with a pre-filled message. Choose your colour and download as PNG — perfect for business cards, flyers and storefronts.",
    features: ["Any number + message", "Custom colour", "Download PNG", "No account needed"],
    accessKey: "qr" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "link",
    href: "/tools/link",
    Icon: IconSend,
    name: "Click-to-Chat Builder",
    tagline: "Link + button in one",
    desc: "Turn any number into a wa.me link with a pre-filled message, plus a ready-made Chat-on-WhatsApp button (HTML + Markdown) for your site, email or bio.",
    features: ["wa.me link + preview", "HTML button snippet", "Markdown link", "Works everywhere"],
    accessKey: "link" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "templates",
    href: "/tools/templates",
    Icon: IconTranscript,
    name: "Message Templates",
    tagline: "Never start from scratch",
    desc: "A library of ready-to-use WhatsApp message templates for sales, support, real estate and e-commerce. Fill the blanks, copy, and paste into your own chat.",
    features: ["Sales, support, real estate", "Fill-in personalisation", "One-tap copy", "Open in WhatsApp"],
    accessKey: "templates" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "shortlink",
    href: "/tools/shortlink",
    Icon: IconRotator,
    name: "Short Links + Analytics",
    tagline: "Track every click",
    desc: "Create branded wazap.lt/w/yourname links that open a WhatsApp chat, and see exactly how many clicks each one drives — perfect for bios, ads and campaigns.",
    features: ["Custom branded slug", "Pre-filled message", "Live click analytics", "Unlimited on Ultimate"],
    accessKey: "shortlink" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "catalog",
    href: "/tools/catalog",
    Icon: IconLinktree,
    name: "Catalog / Order Page",
    tagline: "Turn browsers into orders",
    desc: "Publish a shareable page of your products or services where every item has an Order-on-WhatsApp button that opens a chat with a pre-filled order.",
    features: ["Unlimited items", "Order button per item", "Branded public link", "Views counter"],
    accessKey: "catalog" as keyof typeof TOOL_LIMITS,
  },
  {
    key: "formatter",
    href: "/tools/formatter",
    Icon: IconTranscript,
    name: "Text Formatter",
    tagline: "Make messages pop",
    desc: "Format WhatsApp messages with bold, italic, strikethrough and monospace — with a live preview — without memorising the symbols.",
    features: ["Bold / italic / strike / mono", "Live WhatsApp preview", "One-tap copy", "Works anywhere"],
    accessKey: "formatter" as keyof typeof TOOL_LIMITS,
  },
  { key:"chatInsights", href:"/tools/chat-insights", Icon:BarChart3, name:"Chat Insights", tagline:"Reveal conversation patterns", desc:"Analyze exported chats privately for message share, busy hours and activity patterns.", features:["Private in-browser analysis","Message share","Peak hours","No upload required"], accessKey:"chatInsights" as keyof typeof TOOL_LIMITS },
  { key:"replyGenerator", href:"/tools/reply-generator", Icon:MessageSquareText, name:"Customer Reply Generator", tagline:"Reply clearly in seconds", desc:"Turn customer inquiries into polished sales and support replies ready to review and send.", features:["Sales and support replies","Tone controls","One-tap copy","Human review first"], accessKey:"replyGenerator" as keyof typeof TOOL_LIMITS },
  { key:"messageScheduler", href:"/tools/message-scheduler", Icon:Clock3, name:"Message Scheduler", tagline:"Never miss the right moment", desc:"Prepare a WhatsApp message and create a calendar reminder with the chat link attached.", features:["Calendar reminder","Prepared chat link","Works on mobile","No unsafe auto-send"], accessKey:"messageScheduler" as keyof typeof TOOL_LIMITS },
];

const PLAN_BADGES = [
  { name: "Free", accessKey: "free" as const },
  { name: "Solo", accessKey: "basic" as const },
  { name: "Growth", accessKey: "pro" as const },
  { name: "Agency", accessKey: "ultimate" as const },
  { name: "Business", accessKey: "ultimate" as const },
];

export default function ToolsCarousel() {
  const [active, setActive] = useState(0);
  const [animDir, setAnimDir] = useState<"left" | "right">("right");
  const [animating, setAnimating] = useState(false);

  const go = useCallback((dir: "left" | "right") => {
    if (animating) return;
    setAnimating(true);
    setAnimDir(dir);
    setTimeout(() => {
      setActive(prev => dir === "right"
        ? (prev + 1) % TOOLS.length
        : (prev - 1 + TOOLS.length) % TOOLS.length);
      setAnimating(false);
    }, 180);
  }, [animating]);

  useEffect(() => {
    const t = setInterval(() => go("right"), 6000);
    return () => clearInterval(t);
  }, [go]);

  const tool = TOOLS[active];
  const limits = TOOL_LIMITS[tool.accessKey];

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* ── Carousel ── */}
      <div className="flex items-center gap-3 sm:gap-5 mb-8">
        {/* Prev */}
        <button onClick={() => go("left")} aria-label="Previous tool"
          className="shrink-0 w-10 h-10 rounded-full border border-slate-700 bg-[#111811] hover:border-[#25D366] hover:bg-[#25D366]/10 flex items-center justify-center transition-all group">
          <ChevronLeft className="h-5 w-5 text-slate-500 group-hover:text-[#25D366] transition-colors" />
        </button>

        {/* Featured card */}
        <div className={`flex-1 transition-all duration-180 ${animating ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"}`}>
          <div className="rounded-3xl border border-[#25D366]/30 bg-[#0d150d] overflow-hidden"
            style={{ boxShadow: "0 0 80px rgba(37,211,102,0.08), 0 0 1px rgba(37,211,102,0.2)" }}>

            {/* Top bar */}
            <div className="h-1 w-full bg-gradient-to-r from-[#25D366] via-[#34eb70] to-[#128C7E]" />

            <div className="p-6 sm:p-10">
              <div className="flex flex-col sm:flex-row sm:items-start gap-6">
                {/* Icon */}
                <div className="shrink-0 w-16 h-16 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center">
                  <tool.Icon size={32} color={GREEN} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#25D366] mb-1">{tool.tagline}</p>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">{tool.name}</h2>
                  <p className="text-slate-400 text-base leading-relaxed mb-6 max-w-lg">{tool.desc}</p>

                  {/* Features */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-8">
                    {tool.features.map(f => (
                      <div key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                        <div className="w-5 h-5 rounded-full bg-[#25D366]/15 border border-[#25D366]/30 flex items-center justify-center shrink-0">
                          <Check className="h-3 w-3 text-[#25D366]" />
                        </div>
                        {f}
                      </div>
                    ))}
                  </div>

                  {/* Plan access row */}
                  <div className="flex flex-wrap gap-2 mb-8">
                    {PLAN_BADGES.map(plan => {
                      const lim = limits[plan.accessKey];
                      return (
                        <div key={plan.name} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 border text-xs font-medium"
                          style={{
                            borderColor: plan.accessKey === "free" ? "#334155" : "#25D366" + "40",
                            backgroundColor: plan.accessKey === "free" ? "#1e293b" : "#25D366" + "10",
                            color: plan.accessKey === "free" ? "#94a3b8" : "#25D366",
                          }}>
                          <span className="font-bold">{plan.name}:</span>
                          <span>{lim.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  <Link href={tool.href}
                    className="inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fba58] px-7 py-3.5 text-sm font-bold text-black transition-all hover:scale-105 active:scale-100">
                    Open Tool <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Next */}
        <button onClick={() => go("right")} aria-label="Next tool"
          className="shrink-0 w-10 h-10 rounded-full border border-slate-700 bg-[#111811] hover:border-[#25D366] hover:bg-[#25D366]/10 flex items-center justify-center transition-all group">
          <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-[#25D366] transition-colors" />
        </button>
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-2 mb-12">
        {TOOLS.map((_, i) => (
          <button key={i} onClick={() => { if (!animating) setActive(i); }} aria-label={`Tool ${i + 1}`}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === active ? "32px" : "8px",
              height: "8px",
              backgroundColor: i === active ? GREEN : "#334155",
            }} />
        ))}
      </div>

      {/* ── All tools grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TOOLS.map((t, i) => (
          <button key={t.key} onClick={() => { if (!animating) { setAnimDir(i > active ? "right" : "left"); setActive(i); } }}
            className={`group rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 ${
              i === active
                ? "border-[#25D366]/50 bg-[#25D366]/8"
                : "border-slate-800 bg-[#111811] hover:border-[#25D366]/30 hover:bg-[#25D366]/5"
            }`}
            style={i === active ? { borderColor: "#25D366" + "50", backgroundColor: "#25D366" + "10" } : {}}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
              i === active ? "bg-[#25D366]/15" : "bg-slate-800 group-hover:bg-[#25D366]/10"
            }`}>
              <t.Icon size={20} color={i === active ? GREEN : "#64748b"} />
            </div>
            <div className="text-xs font-semibold text-white leading-tight">{t.name}</div>
            <div className="text-xs mt-1" style={{ color: i === active ? GREEN : "#475569" }}>
              {TOOL_LIMITS[t.accessKey].free.uses === 0 ? "Preview" :
               TOOL_LIMITS[t.accessKey].free.uses === -1 ? "Free" :
               `Free: ${TOOL_LIMITS[t.accessKey].free.label}`}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-slate-800 bg-[#111811] p-6 text-center">
        <h2 className="text-lg font-bold text-white">Need more capacity or team controls?</h2>
        <p className="mt-1 text-sm text-slate-400">Compare every plan, tool limit, routing feature, and Business service in one place.</p>
        <Link href="/pricing" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-[#1fba58]">
          Compare plans <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
