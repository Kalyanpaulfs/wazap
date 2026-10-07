"use client";

import { FormEvent, useState } from "react";
import { Loader2, MessageCircle, X } from "lucide-react";

export default function CatalogOrderButton({ slug, itemIndex, itemName }: { slug: string; itemIndex: number; itemName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/catalog/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, item: itemIndex, name, phone, email, consent }),
      });
      const data = await response.json();
      if (!response.ok || !data.targetUrl) {
        setError(data.error || "Could not start this order. Please try again.");
        return;
      }
      window.location.assign(data.targetUrl);
    } catch {
      setError("Could not start this order. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#25D366] hover:bg-[#1fba58] px-4 py-2 text-sm font-semibold text-black transition-colors">
        <MessageCircle className="h-4 w-4" /> Order
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={`Order ${itemName}`}>
          <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[#25D366]/30 bg-[#0d150d] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#25D366]">Start your WhatsApp order</p>
                <h2 className="mt-1 text-xl font-bold text-white">{itemName}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close order form" className="rounded-full border border-slate-700 p-2 text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-3 text-sm text-slate-400">Tell the business who you are, then continue in WhatsApp with the order already prepared.</p>
            <div className="mt-5 space-y-3">
              <label className="block text-xs text-slate-400">Your name
                <input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-[#25D366]" />
              </label>
              <label className="block text-xs text-slate-400">Your WhatsApp number
                <input required autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Include country code" maxLength={24} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-[#25D366]" />
              </label>
              <label className="block text-xs text-slate-400">Email <span className="text-slate-600">(optional)</span>
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={160} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-[#25D366]" />
              </label>
              <label className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs leading-relaxed text-slate-400">
                <input required type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 accent-[#25D366]" />
                <span>I agree to share these details with this business so it can respond to my inquiry. Wazap does not store WhatsApp message content.</span>
              </label>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
            <button disabled={submitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3 text-sm font-bold text-black disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              {submitting ? "Preparing…" : "Continue to WhatsApp"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
