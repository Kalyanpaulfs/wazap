"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Copy, Check, Trash2, Link2, BarChart3, Loader2, Crown } from "lucide-react";

interface SL { id: string; code: string; name: string; phone: string; message: string; clicks: number; }
const DIALS = ["971","966","974","965","973","968","1","44","91","20","961","962"];

export default function ShortLinkPage() {
  const [links, setLinks] = useState<SL[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [dial, setDial] = useState("971");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("https://wazap.lt");

  useEffect(() => { setOrigin(window.location.origin); load(); }, []);
  async function load() {
    const res = await fetch("/api/shortlinks");
    if (res.ok) setLinks(await res.json());
    setLoading(false);
  }
  async function create() {
    setError(""); setUpgrade(false);
    if (!name.trim() || !phone.trim()) { setError("Add a name and phone number."); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/shortlinks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: dial + phone, message, slug }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Could not create."); setUpgrade(!!d.upgrade); return; }
      setName(""); setPhone(""); setMessage(""); setSlug("");
      setLinks(l => [d, ...l]);
    } finally { setCreating(false); }
  }
  async function del(id: string) {
    if (!confirm("Delete this short link? The URL will stop working.")) return;
    await fetch("/api/shortlinks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setLinks(l => l.filter(x => x.id !== id));
  }
  function copy(text: string, k: string) { navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(""), 1500); }

  const totalClicks = links.reduce((s, l) => s + l.clicks, 0);

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 h-10 flex items-center gap-3 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Branded Short Links</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-yellow-400"><Crown className="h-3 w-3" /> Paid</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Branded Short Links + Analytics</h1>
            <p className="text-slate-400">Create memorable <span className="font-mono text-[#25D366]">wazap.lt/w/yourname</span> links that open a WhatsApp chat — and track exactly how many clicks each one gets.</p>
          </div>

          {links.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-[#111811] p-4"><div className="text-2xl font-bold text-white">{links.length}</div><div className="text-xs text-slate-500 mt-1">Short links</div></div>
              <div className="rounded-2xl border border-slate-800 bg-[#111811] p-4"><div className="text-2xl font-bold text-[#25D366]">{totalClicks.toLocaleString()}</div><div className="text-xs text-slate-500 mt-1">Total clicks</div></div>
            </div>
          )}

          {/* Create */}
          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-3">
            <div className="flex items-center gap-2 mb-1"><Link2 className="h-4 w-4 text-[#25D366]" /><span className="text-sm font-medium text-white">New short link</span></div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Internal name (e.g. Instagram bio)" className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
            <div className="flex gap-2">
              <select value={dial} onChange={e => setDial(e.target.value)} className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#25D366]">{DIALS.map(d => <option key={d} value={d}>+{d}</option>)}</select>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="WhatsApp number" inputMode="tel" className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] font-mono" />
            </div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="Pre-filled message (optional)" className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] resize-none" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-mono shrink-0">{origin.replace(/^https?:\/\//,"")}/w/</span>
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="custom-slug (optional)" className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] font-mono" />
            </div>
            {error && <p className="text-sm text-red-400">{error} {upgrade && <Link href="/pricing" className="underline text-[#25D366]">Upgrade →</Link>}</p>}
            <button onClick={create} disabled={creating} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-50 py-3 text-sm font-bold text-black transition-colors">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create short link</button>
          </div>

          {/* List */}
          {loading ? <p className="text-center text-slate-600 text-sm">Loading…</p> : links.length === 0 ? (
            <p className="text-center text-slate-600 text-sm">No short links yet. Create your first trackable link above.</p>
          ) : (
            <div className="space-y-3">
              {links.map(l => {
                const url = `${origin}/w/${l.code}`;
                return (
                  <div key={l.id} className="rounded-2xl border border-slate-800 bg-[#111811] p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{l.name}</div>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-[#25D366] hover:underline truncate">{url.replace(/^https?:\/\//,"")}</a>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 text-sm text-slate-300"><BarChart3 className="h-4 w-4 text-[#25D366]" /> {l.clicks.toLocaleString()} <span className="text-xs text-slate-500">clicks</span></span>
                        <button onClick={() => copy(url, l.id)} className="text-slate-400 hover:text-[#25D366]">{copied === l.id ? <Check className="h-4 w-4 text-[#25D366]" /> : <Copy className="h-4 w-4" />}</button>
                        <button onClick={() => del(l.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
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
