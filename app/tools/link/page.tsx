"use client";
import { useState } from "react";
import Link from "next/link";
import { Copy, Check, MessageCircle, ExternalLink, Code2, Link2 } from "lucide-react";

const COUNTRIES = [
  { code: "971", label: "🇦🇪 +971" }, { code: "966", label: "🇸🇦 +966" }, { code: "974", label: "🇶🇦 +974" },
  { code: "965", label: "🇰🇼 +965" }, { code: "973", label: "🇧🇭 +973" }, { code: "968", label: "🇴🇲 +968" },
  { code: "1", label: "🇺🇸 +1" }, { code: "44", label: "🇬🇧 +44" }, { code: "91", label: "🇮🇳 +91" },
  { code: "20", label: "🇪🇬 +20" }, { code: "961", label: "🇱🇧 +961" }, { code: "962", label: "🇯🇴 +962" },
];

export default function LinkBuilderPage() {
  const [cc, setCc] = useState("971");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");

  const clean = (cc + phone).replace(/\D/g, "");
  const valid = clean.length >= 8;
  const link = valid ? `https://wa.me/${clean}${msg ? `?text=${encodeURIComponent(msg)}` : ""}` : "";
  const html = link
    ? `<a href="${link}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;font-weight:600;padding:12px 22px;border-radius:9999px;text-decoration:none;font-family:sans-serif;font-size:15px">Chat on WhatsApp</a>`
    : "";
  const md = link ? `[Chat on WhatsApp](${link})` : "";

  function copy(text: string, key: string) {
    if (!text) return;
    navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500);
  }
  const CopyBtn = ({ text, k }: { text: string; k: string }) => (
    <button onClick={() => copy(text, k)} disabled={!text}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 hover:border-[#25D366] disabled:opacity-40 px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors">
      {copied === k ? <Check className="h-3.5 w-3.5 text-[#25D366]" /> : <Copy className="h-3.5 w-3.5" />}
      {copied === k ? "Copied" : "Copy"}
    </button>
  );

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 h-10 flex items-center gap-3 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Click-to-Chat Link Builder</span>
        <span className="ml-auto text-xs text-slate-500">Free · unlimited</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Click-to-Chat Link &amp; Button Builder</h1>
            <p className="text-slate-400">Turn any number into a wa.me link with a pre-filled message — then grab a ready-made &ldquo;Chat on WhatsApp&rdquo; button for your website, email or bio.</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
            <div className="flex gap-2">
              <select value={cc} onChange={e => setCc(e.target.value)}
                className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm text-white focus:outline-none focus:border-[#25D366]">
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" inputMode="tel"
                className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] font-mono" />
            </div>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3} placeholder="Pre-filled message (optional) — e.g. Hi! I'd like to know more about…"
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] resize-none" />
          </div>

          {valid ? (
            <div className="space-y-4">
              {/* Live button preview */}
              <div className="rounded-2xl border border-slate-800 bg-[#111811] p-6 text-center">
                <div className="text-xs text-slate-500 mb-3">Live preview</div>
                <a href={link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fba58] px-6 py-3 text-sm font-semibold text-black transition-colors">
                  <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
                </a>
              </div>

              {/* wa.me link */}
              <div className="rounded-2xl border border-slate-800 bg-[#111811] p-4">
                <div className="flex items-center gap-2 mb-2"><Link2 className="h-4 w-4 text-[#25D366]" /><span className="text-sm font-medium text-white">wa.me link</span></div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-300 font-mono">{link}</code>
                  <CopyBtn text={link} k="link" />
                  <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-slate-500 hover:text-[#25D366]"><ExternalLink className="h-4 w-4" /></a>
                </div>
              </div>

              {/* HTML button snippet */}
              <div className="rounded-2xl border border-slate-800 bg-[#111811] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><Code2 className="h-4 w-4 text-[#25D366]" /><span className="text-sm font-medium text-white">HTML button (for websites &amp; emails)</span></div>
                  <CopyBtn text={html} k="html" />
                </div>
                <pre className="rounded-lg bg-slate-900 p-3 text-[11px] text-slate-400 overflow-x-auto whitespace-pre-wrap break-all">{html}</pre>
              </div>

              {/* Markdown */}
              <div className="rounded-2xl border border-slate-800 bg-[#111811] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Markdown link</span>
                  <CopyBtn text={md} k="md" />
                </div>
                <code className="mt-2 block truncate rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-300 font-mono">{md}</code>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-slate-600">Enter a phone number to generate your link and button.</p>
          )}

          <p className="text-center text-xs text-slate-600">Uses WhatsApp&apos;s official click-to-chat (wa.me) links — no app, no API, works on mobile &amp; desktop.</p>
        </div>
      </div>
    </>
  );
}
