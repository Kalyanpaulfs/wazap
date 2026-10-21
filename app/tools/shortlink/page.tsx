"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Copy, Check, Trash2, Link2, BarChart3, Loader2, Crown } from "lucide-react";
import PlanPausedBadge from "@/app/components/PlanPausedBadge";

interface SL { id: string; code: string; name: string; phone: string; message: string; clicks: number; planPausedAt?: string | null; }
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
  const [limit, setLimit] = useState<number | null>(null);
  const [planLabel, setPlanLabel] = useState("");

  useEffect(() => { setOrigin(window.location.origin); load(); }, []);
  async function load() {
    try {
      const res = await fetch("/api/shortlinks");
      if (res.ok) {
        const data = await res.json();
        setLinks(data.links ?? []);
        setLimit(typeof data.limit === "number" ? data.limit : null);
        setPlanLabel(data.planLabel ?? "");
      } else if (res.status !== 401) throw new Error("Saved items could not be loaded. Try reloading the page.");
    } catch (e) { setError(e instanceof Error ? e.message : "Saved items could not be loaded."); }
    finally { setLoading(false); }
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
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Please try again."); } finally { setCreating(false); }
  }
  async function del(id: string) {
    if (!confirm("Delete this short link? The URL will stop working.")) return;
    try {
    const response = await fetch("/api/shortlinks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!response.ok) throw new Error("Delete failed. The saved item remains in your list.");
    setLinks(l => l.filter(x => x.id !== id));    } catch (e) { setError(e instanceof Error ? e.message : "Delete failed."); }
  }
  async function copy(text: string, k: string) { try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(""), 1500); } catch { setError("Copy was blocked. Select the link and copy it manually."); } }

  const totalClicks = links.reduce((s, l) => s + l.clicks, 0);

  return (
    <>
      <div className="wp-subbar border-b border-border bg-bg/90 px-4 min-h-10 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link href="/tools" className="text-muted hover:text-text">← Tools</Link>
        <span className="text-text">/</span>
        <span className="text-text font-medium">Branded Short Links</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-warning"><Crown className="h-3 w-3" /> Paid</span>
      </div>

      <div className="px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-text mb-2">Branded Short Links + Analytics</h1>
            <p className="text-muted">Create memorable <span className="font-mono text-accent">wazap.lt/w/yourname</span> links that open a WhatsApp chat — and track exactly how many clicks each one gets.</p>
          </div>

          {links.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-surface p-4"><div className="text-2xl font-bold text-text">{links.length}</div><div className="text-xs text-muted mt-1">Short links</div></div>
              <div className="rounded-2xl border border-border bg-surface p-4"><div className="text-2xl font-bold text-accent">{totalClicks.toLocaleString()}</div><div className="text-xs text-muted mt-1">Total clicks</div></div>
            </div>
          )}

          {/* Create */}
          <div className="rounded-2xl border border-border bg-surface p-6 space-y-3">
            <div className="flex items-center gap-2 mb-1"><Link2 className="h-4 w-4 text-accent" /><span className="text-sm font-medium text-text">New short link</span></div>
            <input aria-label="Internal name (e.g. Instagram bio)" value={name} onChange={e => setName(e.target.value)} placeholder="Internal name (e.g. Instagram bio)" className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent" />
            <div className="flex gap-2">
              <select aria-label="Country code" value={dial} onChange={e => setDial(e.target.value)} className="rounded-xl bg-surface border border-border-strong px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent">{DIALS.map(d => <option key={d} value={d}>+{d}</option>)}</select>
              <input aria-label="WhatsApp number" value={phone} onChange={e => setPhone(e.target.value)} placeholder="WhatsApp number" inputMode="tel" className="min-w-0 flex-1 rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent font-mono" />
            </div>
            <textarea aria-label="Pre-filled message (optional)" value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="Pre-filled message (optional)" className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent resize-none" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted font-mono shrink-0">{origin.replace(/^https?:\/\//,"")}/w/</span>
              <input aria-label="custom-slug (optional)" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="custom-slug (optional)" className="min-w-0 flex-1 rounded-xl bg-surface border border-border-strong px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent font-mono" />
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error} {upgrade && <Link href="/pricing" className="underline text-accent">Upgrade →</Link>}</p>}
            <button onClick={create} disabled={creating} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent hover:bg-accent-hover disabled:opacity-50 py-3 text-sm font-bold text-on-accent transition-colors">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create short link</button>
            {limit !== null && (
              <p className="text-xs text-muted">
                {links.length} of {limit === 0 ? "0 (not in your plan)" : limit} short links on your {planLabel} plan
                {links.length >= limit && <> · <Link href="/pricing" className="text-accent underline">Upgrade for more</Link></>}
              </p>
            )}
          </div>

          {/* List */}
          {loading ? <p className="text-center text-muted text-sm">Loading…</p> : links.length === 0 ? (
            <p className="text-center text-muted text-sm">No short links yet. Create your first trackable link above.</p>
          ) : (
            <div className="space-y-3">
              {links.map(l => {
                const url = `${origin}/w/${l.code}`;
                return (
                  <div key={l.id} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><div className="text-sm font-medium text-text truncate">{l.name}</div>{l.planPausedAt && <PlanPausedBadge />}</div>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-accent hover:underline truncate">{url.replace(/^https?:\/\//,"")}</a>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 text-sm text-muted"><BarChart3 className="h-4 w-4 text-accent" /> {l.clicks.toLocaleString()} <span className="text-xs text-muted">clicks</span></span>
                        <button onClick={() => copy(url, l.id)} className="text-muted hover:text-accent">{copied === l.id ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}</button>
                        <button onClick={() => del(l.id)} className="text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
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
