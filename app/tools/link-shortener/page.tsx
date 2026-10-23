"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Copy, Check, Download, Trash2, Scissors, ExternalLink } from "lucide-react";

type ShortUrlRow = {
  id: string;
  code: string;
  publicUrl: string;
  targetUrl: string;
  title: string | null;
  clicks: number;
  createdAt: string;
  disabled: boolean;
  disabledReason: string | null;
  reportCount: number;
};

function truncate(value: string, max = 50) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Fixed locale + timeZone (not the visitor's own) so server-prerendered and
// client-hydrated markup always match - same approach as
// app/links/[type]/[id]/LinkDetailsClient.tsx's createdLabel.
function formatCreated(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function slugify(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "link";
}

export default function LinkShortenerPage() {
  const [rows, setRows] = useState<ShortUrlRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [targetUrl, setTargetUrl] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/short-urls");
      if (res.status === 401) {
        setAuthRequired(true);
      } else if (res.ok) {
        const data = await res.json();
        setRows(data.links ?? []);
        setAuthRequired(false);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!targetUrl.trim()) {
      setError("Enter a URL to shorten.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/short-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: targetUrl.trim(), code: customCode.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setAuthRequired(true);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Could not shorten that link. Please try again.");
        return;
      }
      setRows((prev) => [data, ...prev]);
      setJustCreatedId(data.id);
      setTargetUrl("");
      setCustomCode("");
    } catch {
      setError("Could not shorten that link. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function del(id: string) {
    const res = await fetch("/api/short-urls", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 h-10 flex items-center gap-3 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Link Shortener</span>
        <span className="ml-auto text-xs text-[#25D366]">Free · unlimited</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Link Shortener</h1>
            <p className="text-slate-400">
              Shorten any website address — not a WhatsApp number. Paste a link below, get a short link with a QR code, and track clicks for free.
            </p>
          </div>

          <form onSubmit={create} className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="shortener-url">Website URL</label>
              <input
                id="shortener-url"
                type="url"
                required
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/your-page"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-[#25D366] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="shortener-code">Custom name (optional)</label>
              <input
                id="shortener-code"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toLowerCase())}
                placeholder="e.g. autumn-sale"
                maxLength={40}
                pattern="[a-z0-9-]{3,40}"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-[#25D366] focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-600">a-z, 0-9 and dashes, 3-40 characters. Leave blank for a random short code.</p>
            </div>

            {authRequired && (
              <div className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-4 text-sm">
                <p className="font-semibold text-white">Sign in to create your short link</p>
                <p className="mt-1 text-slate-400">It&apos;s free - sign in or create an account, then come back here.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href="/signup?redirect=/tools/link-shortener" className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-black hover:bg-[#1fba58]">Sign up free</Link>
                  <Link href="/login?redirect=/tools/link-shortener" className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-white hover:border-[#25D366]">Log in</Link>
                </div>
              </div>
            )}
            {error && !authRequired && <p role="alert" className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={creating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3 text-sm font-bold text-black transition-colors hover:bg-[#1fba58] disabled:opacity-50"
            >
              <Scissors className="h-4 w-4" /> {creating ? "Shortening…" : "Shorten link"}
            </button>
          </form>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Your short links</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : !authRequired && rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">No short links yet. Create one above.</p>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <ShortUrlRowCard key={row.id} row={row} initiallyOpen={row.id === justCreatedId} onDelete={() => del(row.id)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function ShortUrlRowCard({ row, initiallyOpen, onDelete }: { row: ShortUrlRow; initiallyOpen: boolean; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(initiallyOpen);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!showQr || qrDataUrl) return;
    let cancelled = false;
    QRCode.toDataURL(row.publicUrl, { width: 320, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showQr, qrDataUrl, row.publicUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(row.publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable - the link is still
      // visible on the card to select and copy manually.
    }
  }

  function downloadQR() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `wazap-${slugify(row.code)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <a href={row.publicUrl} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-sm text-[#25D366] hover:underline">{row.publicUrl}</a>
            {row.disabled && (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                Disabled{row.disabledReason === "reported" ? " (reported)" : ""}
              </span>
            )}
          </div>
          <p className="mt-1 break-all text-xs text-slate-500" title={row.targetUrl}>→ {truncate(row.targetUrl)}</p>
          <p className="mt-1 text-xs text-slate-600">{row.clicks.toLocaleString()} click{row.clicks === 1 ? "" : "s"} · Created {formatCreated(row.createdAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white">
            {copied ? <Check className="h-3.5 w-3.5 text-[#25D366]" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={() => setShowQr((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white">
            {showQr ? "Hide QR" : "QR code"}
          </button>
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)} aria-label="Delete" className="rounded-full border border-slate-700 p-1.5 text-slate-500 hover:border-red-500/50 hover:text-red-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-slate-400">Delete?</span>
              <button type="button" onClick={onDelete} className="rounded-full bg-red-500/90 px-2.5 py-1 font-semibold text-white hover:bg-red-500">Yes</button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300 hover:border-slate-500">Cancel</button>
            </span>
          )}
        </div>
      </div>

      {showQr && (
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-800 pt-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR code for ${row.publicUrl}`} className="h-28 w-28 rounded-xl border border-slate-800 bg-white p-2" />
          ) : (
            <div className="h-28 w-28 animate-pulse rounded-xl bg-slate-900" />
          )}
          <div className="flex flex-col gap-2">
            <button type="button" onClick={downloadQR} disabled={!qrDataUrl} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> Download QR
            </button>
            <a href={row.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
