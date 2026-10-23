"use client";
// FEAT-QUEUE: Link tab - the one shared link every salesperson taps to get
// their next free customer. Copy/share it, or make a new one (invalidates
// the old one - same inline-confirm pattern as LinkDetailsClient.tsx).
import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function LinkTab({ teamLink, onNewLink }: { teamLink: string; onNewLink: (code: string, link: string) => void }) {
  const [link, setLink] = useState(teamLink);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy was blocked. Select the link and copy it manually.");
    }
  }

  function shareOnWhatsApp() {
    const text = encodeURIComponent("Tap this link to get your next customer: " + link);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  async function regenerate() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/outreach/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateCode: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not make a new link. Please try again.");
      const newCode = data.team.code as string;
      const newLink = link.replace(/\/team\/[^/]+$/, `/team/${newCode}`);
      setLink(newLink);
      onNewLink(newCode, newLink);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make a new link.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7">
      <div>
        <p className="text-xs text-slate-500">Team link</p>
        <p className="mt-1 break-all rounded-xl bg-slate-900 px-3 py-2.5 font-mono text-sm text-white">{link}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#25D366]" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={shareOnWhatsApp}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white"
        >
          Share on WhatsApp
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Share this with every salesperson. They tap it on their own phone to get their next free customer — no
        prefilled message.
      </p>

      <div className="border-t border-slate-800 pt-5">
        {confirming ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-300">This stops the old link from working. Share the new one with your team.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={regenerate}
                disabled={saving}
                className="rounded-full bg-amber-500/90 px-4 py-1.5 text-xs font-semibold text-black hover:bg-amber-500 disabled:opacity-50"
              >
                {saving ? "Making…" : "Yes, make a new link"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="rounded-full border border-slate-700 px-4 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-full border border-slate-700 px-4 py-1.5 text-xs font-semibold text-slate-300 hover:border-red-400 hover:text-red-300"
          >
            Make a new link
          </button>
        )}
        {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    </section>
  );
}
