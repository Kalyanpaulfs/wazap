"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Trash2, Copy, Check, BarChart2 } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
import PlanPausedBadge from "@/app/components/PlanPausedBadge";

interface AdLink { id: string; name: string; number: string; message?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; clicks: number; createdAt: string; planPausedAt?: string | null; }

const UTM_FIELDS = [
  ["utmSource", "UTM Source", "facebook"],
  ["utmMedium", "UTM Medium", "cpc"],
  ["utmCampaign", "UTM Campaign", "summer-sale"],
] as const;

export default function AdBuilderPage() {
  const [links, setLinks] = useState<AdLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", dial: "971", number: "", message: "", utmSource: "", utmMedium: "", utmCampaign: "" });

  useEffect(() => { fetchLinks(); }, []);

  async function fetchLinks() {
    try {
      const res = await fetch("/api/adlinks");
      if (res.ok) setLinks(await res.json());
      else if (res.status !== 401) throw new Error("Saved links could not be loaded. Try reloading the page.");
    } catch (e) { setError(e instanceof Error ? e.message : "Links could not be loaded."); }
    finally { setLoading(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(""); setCreating(true);
    try {
      const res = await fetch("/api/adlinks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, number: form.dial + form.number.replace(/\D/g, "") }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 401 ? "Sign in to save a tracked ad link." : data.error || "Could not save the ad link.");
      await fetchLinks(); setForm({ name: "", dial: "971", number: "", message: "", utmSource: "", utmMedium: "", utmCampaign: "" });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the ad link. Please try again."); }
    finally { setCreating(false); }
  }

  async function del(id: string) {
    setError("");
    try {
      const res = await fetch("/api/adlinks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error("The link could not be deleted. It remains in your list.");
      setLinks(l => l.filter(x => x.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "The link could not be deleted."); }
  }

  function buildUrl(link: AdLink) {
    const base = link.message
      ? `https://wa.me/${link.number}?text=${encodeURIComponent(link.message)}`
      : `https://wa.me/${link.number}`;
    return `${window.location.origin}/a/${link.id}?to=${encodeURIComponent(base)}`;
  }

  async function copy(id: string, url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 2000); }
    catch { setError("Copy was blocked. Select the link and copy it manually."); }
  }

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 min-h-10 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Ad Link Builder</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Click-to-WhatsApp Ad Builder</h1>
            <p className="text-slate-400">Create trackable WhatsApp links for your ads. See exactly how many clicks each campaign gets.</p>
          </div>

          {error && <p role="alert" className="text-sm text-red-400">{error} <Link href="/login" className="underline">Sign in</Link></p>}
          {/* Create form */}
          <form onSubmit={create} className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
            <h2 className="font-semibold text-white flex items-center gap-2"><Plus className="h-4 w-4 text-[#25D366]" /> New Ad Link</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Campaign Name</label>
                <input aria-label="e.g. Facebook Lead Gen" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Facebook Lead Gen"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
              </div>
              <div className="flex gap-2">
                <select aria-label="Country code" value={form.dial} onChange={e => setForm(f => ({ ...f, dial: e.target.value }))}
                  className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#25D366] shrink-0">
                  {COUNTRIES.map(c => <option key={c.code} value={c.dial.replace("+","")}>{c.dial}</option>)}
                </select>
                <input aria-label="Phone number" required value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="Phone number"
                  className="min-w-0 flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Pre-filled message (optional)</label>
              <input aria-label="Hi, I saw your ad and I'm interested..." value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Hi, I saw your ad and I'm interested..."
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {UTM_FIELDS.map(([key,label,ph]) => (
                <div key={key}>
                  <label className="text-xs text-slate-400 block mb-1">{label}</label>
                  <input aria-label={label} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                </div>
              ))}
            </div>
            <button type="submit" disabled={creating}
              className="rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-50 px-6 py-2.5 text-sm font-bold text-black transition-colors">
              {creating ? "Creating..." : "Create Ad Link"}
            </button>
          </form>

          {/* Links list */}
          {loading ? (
            <div className="text-center text-slate-500 py-8">Loading...</div>
          ) : links.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-500">No ad links yet. Create one above.</div>
          ) : (
            <div className="space-y-4">
              <h2 className="font-semibold text-white">Your Ad Links</h2>
              {links.map(link => {
                const url = typeof window !== "undefined" ? buildUrl(link) : "";
                return (
                  <div key={link.id} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2"><h3 className="font-semibold text-white">{link.name}</h3>{link.planPausedAt && <PlanPausedBadge />}</div>
                        <p className="text-xs text-slate-500 mt-0.5">+{link.number} {link.utmSource && `· ${link.utmSource}`} {link.utmCampaign && `· ${link.utmCampaign}`}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 rounded-full bg-[#25D366]/10 border border-[#25D366]/30 px-3 py-1">
                          <BarChart2 className="h-3.5 w-3.5 text-[#25D366]" />
                          <span className="text-sm font-bold text-[#25D366]">{link.clicks}</span>
                          <span className="text-xs text-slate-500">clicks</span>
                        </div>
                        <button onClick={() => copy(link.id, url)}
                          className="flex items-center gap-1.5 rounded-full border border-slate-700 hover:border-[#25D366] px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors">
                          {copied === link.id ? <Check className="h-3.5 w-3.5 text-[#25D366]" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied === link.id ? "Copied!" : "Copy Link"}
                        </button>
                        <button onClick={() => del(link.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1.5">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
