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
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const clean = (cc + phone).replace(/\D/g, "");
  const valid = phone.replace(/\D/g, "").length > 0 && /^[1-9]\d{6,14}$/.test(clean);
  const link = valid ? `https://wa.me/${clean}${msg ? `?text=${encodeURIComponent(msg)}` : ""}` : "";
  const html = link
    ? `<a href="${link}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#fff;font-weight:600;padding:12px 22px;border-radius:9999px;text-decoration:none;font-family:sans-serif;font-size:15px">Chat on WhatsApp</a>`
    : "";
  const md = link ? `[Chat on WhatsApp](${link})` : "";

  async function copy(text: string, key: string) {
    if (!text) return;
    setError("");
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500); }
    catch { setError("Copy was blocked. Select the link or snippet and copy it manually."); }
  }
  const CopyBtn = ({ text, k }: { text: string; k: string }) => (
    <button onClick={() => copy(text, k)} disabled={!text}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border-strong hover:border-accent disabled:opacity-40 px-3 py-1.5 text-xs text-muted hover:text-text transition-colors">
      {copied === k ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
      {copied === k ? "Copied" : "Copy"}
    </button>
  );

  return (
    <>
      <div className="border-b border-border bg-bg/90 px-4 min-h-10 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link href="/tools" className="text-muted hover:text-text">← Tools</Link>
        <span className="text-text">/</span>
        <span className="text-text font-medium">Click-to-Chat Link Builder</span>
        <span className="ml-auto text-xs text-muted">Free · unlimited</span>
      </div>

      <div className="px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-text mb-2">Click-to-Chat Link &amp; Button Builder</h1>
            <p className="text-muted">Turn any number into a wa.me link with a pre-filled message — then grab a ready-made &ldquo;Chat on WhatsApp&rdquo; button for your website, email or bio.</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
            <div className="flex gap-2">
              <select aria-label="Country code" value={cc} onChange={e => setCc(e.target.value)}
                className="rounded-xl bg-surface border border-border-strong px-3 py-3 text-sm text-text focus:outline-none focus:border-accent">
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <input aria-label="Phone number without country code" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="Phone number" inputMode="numeric"
                className="min-w-0 flex-1 rounded-xl bg-surface border border-border-strong px-4 py-3 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent font-mono" />
            </div>
            <textarea aria-label="Pre-filled message" value={msg} onChange={e => setMsg(e.target.value)} rows={3} placeholder="Pre-filled message (optional) — e.g. Hi! I'd like to know more about…"
              className="w-full rounded-xl bg-surface border border-border-strong px-4 py-3 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent resize-none" />
          </div>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {valid ? (
            <div className="space-y-4">
              {/* Live button preview */}
              <div className="rounded-2xl border border-border bg-surface p-6 text-center">
                <div className="text-xs text-muted mb-3">Live preview</div>
                <a href={link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-accent hover:bg-accent-hover px-6 py-3 text-sm font-semibold text-on-accent transition-colors">
                  <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
                </a>
              </div>

              {/* wa.me link */}
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 mb-2"><Link2 className="h-4 w-4 text-accent" /><span className="text-sm font-medium text-text">wa.me link</span></div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate rounded-lg bg-surface px-3 py-2 text-xs text-muted font-mono">{link}</code>
                  <CopyBtn text={link} k="link" />
                  <a aria-label="Open generated WhatsApp link" href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted hover:text-accent"><ExternalLink className="h-4 w-4" /></a>
                </div>
              </div>

              {/* HTML button snippet */}
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><Code2 className="h-4 w-4 text-accent" /><span className="text-sm font-medium text-text">HTML button (for websites &amp; emails)</span></div>
                  <CopyBtn text={html} k="html" />
                </div>
                <pre className="rounded-lg bg-surface p-3 text-[11px] text-muted overflow-x-auto whitespace-pre-wrap break-all">{html}</pre>
              </div>

              {/* Markdown */}
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text">Markdown link</span>
                  <CopyBtn text={md} k="md" />
                </div>
                <code className="mt-2 block truncate rounded-lg bg-surface px-3 py-2 text-xs text-muted font-mono">{md}</code>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-muted">Enter a valid international number (7–15 digits total) using the country selector.</p>
          )}

          <p className="text-center text-xs text-muted">Uses WhatsApp&apos;s official click-to-chat (wa.me) links — no app, no API, works on mobile &amp; desktop.</p>
        </div>
      </div>
    </>
  );
}
