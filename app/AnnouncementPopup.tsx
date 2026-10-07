"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Sparkles, ArrowRight } from "lucide-react";

// Bump VERSION whenever the announcement content changes to re-show it to everyone.
const VERSION = "v2";
const KEY = `wazap_announce_${VERSION}`;

const NEW_TOOLS = [
  { emoji: "✅", name: "Real WhatsApp Validation", desc: "See which numbers are actually on WhatsApp — verified live.", href: "/tools/checker" },
  { emoji: "📇", name: "vCard + QR Pack", desc: "Create a digital business card and WhatsApp QR code in one place.", href: "/tools/vcard" },
  { emoji: "🔗", name: "Short Links", desc: "Create branded click-to-chat links for bios, ads, and support pages.", href: "/tools/shortlink" },
  { emoji: "🧾", name: "Transcript Exporter", desc: "Turn exported WhatsApp chat text into a clean printable record.", href: "/tools/transcript" },
];
const COMING = [
  { emoji: "💳", name: "Card payments" },
  { emoji: "📊", name: "Link analytics" },
  { emoji: "🧩", name: "More productivity tools" },
];

export default function AnnouncementPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) {
        const t = setTimeout(() => setOpen(true), 700);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  function close() {
    setOpen(false);
    try { localStorage.setItem(KEY, "1"); } catch {}
  }

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-lg rounded-2xl border border-[#25D366]/30 bg-[#0e140e] shadow-2xl overflow-hidden">
        <button onClick={close} aria-label="Close" className="absolute top-3 right-3 text-slate-500 hover:text-white z-10">
          <X className="h-5 w-5" />
        </button>

        <div className="bg-gradient-to-br from-[#25D366]/20 to-transparent px-6 pt-6 pb-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/15 border border-[#25D366]/30 px-3 py-1 text-xs font-semibold text-[#25D366] mb-2">
            <Sparkles className="h-3.5 w-3.5" /> Just launched
          </div>
          <h2 className="text-xl font-bold text-white">New tools are live 🎉</h2>
          <p className="text-slate-400 text-sm mt-1">We&apos;ve been busy — here&apos;s what&apos;s new on Wazap.</p>
        </div>

        <div className="px-6 py-4 space-y-2 max-h-[52vh] overflow-y-auto">
          {NEW_TOOLS.map(t => (
            <Link key={t.name} href={t.href} onClick={close}
              className="flex items-start gap-3 rounded-xl border border-slate-800 hover:border-[#25D366]/40 bg-[#111811] hover:bg-[#25D366]/5 p-3 transition-colors">
              <span className="text-xl leading-none mt-0.5">{t.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white flex items-center gap-1">
                  {t.name} <ArrowRight className="h-3 w-3 text-[#25D366]" />
                </div>
                <div className="text-xs text-slate-400">{t.desc}</div>
              </div>
            </Link>
          ))}

          <div className="pt-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Coming soon</div>
            <div className="flex flex-wrap gap-2">
              {COMING.map(c => (
                <span key={c.name} className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-[#111811] px-3 py-1.5 text-xs text-slate-300">
                  <span>{c.emoji}</span> {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
          <button onClick={close} className="text-sm text-slate-500 hover:text-white transition-colors">Maybe later</button>
          <Link href="/tools" onClick={close}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] hover:bg-[#1fba58] px-5 py-2 text-sm font-semibold text-black transition-colors">
            Explore all tools <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
