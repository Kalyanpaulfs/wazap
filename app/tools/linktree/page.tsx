"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { MessageCircle, Plus, Trash2, Copy, Check, ExternalLink } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";

interface WaLink { label: string; number: string; note: string; }
interface Page { id: string; slug: string; title: string; bio: string; color: string; links: WaLink[]; views: number; }

const COLORS = ["#25D366","#128C7E","#7c3aed","#0070ba","#dc2626","#ea580c","#000000"];

export default function LinktreePage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ slug: "", title: "", bio: "", color: "#25D366" });
  const [links, setLinks] = useState<WaLink[]>([{ label: "", number: "", note: "" }, { label: "", number: "", note: "" }]);
  const [dial, setDial] = useState("971");
  const [error, setError] = useState("");

  useEffect(() => { fetchPages(); }, []);

  async function fetchPages() {
    const res = await fetch("/api/linktree");
    if (res.ok) setPages(await res.json());
    setLoading(false);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const validLinks = links.filter(l => l.label && l.number).map(l => ({ ...l, number: dial + l.number.replace(/\D/g, "") }));
    if (validLinks.length < 1) { setError("Add at least one link"); return; }
    setCreating(true);
    const res = await fetch("/api/linktree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, links: validLinks }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setCreating(false); return; }
    await fetchPages();
    setShowForm(false);
    setForm({ slug: "", title: "", bio: "", color: "#25D366" });
    setLinks([{ label: "", number: "", note: "" }, { label: "", number: "", note: "" }]);
    setCreating(false);
  }

  async function del(id: string) {
    await fetch("/api/linktree", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setPages(p => p.filter(x => x.id !== id));
  }

  function getUrl(slug: string) { return `${window.location.origin}/l/${slug}`; }
  function copy(id: string, url: string) { navigator.clipboard.writeText(url); setCopied(id); setTimeout(() => setCopied(null), 2000); }

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 h-10 flex items-center gap-3 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">WhatsApp Linktree</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">WhatsApp Linktree</h1>
            <p className="text-slate-400">One link, multiple WhatsApp numbers. Show all your team, departments, or languages on one clean page.</p>
          </div>

          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              className="w-full rounded-2xl border border-dashed border-[#25D366]/40 hover:border-[#25D366] py-8 flex items-center justify-center gap-2 text-[#25D366] hover:text-white transition-colors">
              <Plus className="h-5 w-5" /> Create New Linktree Page
            </button>
          ) : (
            <form onSubmit={create} className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white">New Page</h2>
                <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white text-sm">Cancel</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Page URL slug *</label>
                  <div className="flex items-center gap-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 focus-within:border-[#25D366]">
                    <span className="text-xs text-slate-500">wazap.lt/l/</span>
                    <input required value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} placeholder="my-team"
                      className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Page Title *</label>
                  <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Sales Team"
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Bio (optional)</label>
                <input value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Contact our team on WhatsApp"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-2">Color</label>
                <div className="flex gap-2">{COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-slate-400">Country Code</label>
                  <select value={dial} onChange={e => setDial(e.target.value)}
                    className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#25D366]">
                    {COUNTRIES.map(c => <option key={c.code} value={c.dial.replace("+","")}>{c.dial} {c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  {links.map((link, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                      <input value={link.label} onChange={e => setLinks(prev => prev.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
                        placeholder="Label (e.g. English)" className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                      <input value={link.number} onChange={e => setLinks(prev => prev.map((l, j) => j === i ? { ...l, number: e.target.value } : l))}
                        placeholder="Phone number" className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                      <input value={link.note} onChange={e => setLinks(prev => prev.map((l, j) => j === i ? { ...l, note: e.target.value } : l))}
                        placeholder="Note (optional)" className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                      {links.length > 1 && (
                        <button type="button" onClick={() => setLinks(prev => prev.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400 p-1 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => setLinks(prev => [...prev, { label: "", number: "", note: "" }])}
                    className="text-xs text-[#25D366] hover:underline">+ Add link</button>
                </div>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={creating}
                className="w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-50 py-3 text-sm font-bold text-black transition-colors">
                {creating ? "Creating..." : "Create Page"}
              </button>
            </form>
          )}

          {loading ? (
            <div className="text-center text-slate-500 py-8">Loading...</div>
          ) : pages.map(page => {
            const url = typeof window !== "undefined" ? getUrl(page.slug) : "";
            const pageLinks = page.links as WaLink[];
            return (
              <div key={page.id} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                      style={{ backgroundColor: page.color }}>{page.title[0]}</div>
                    <div>
                      <h3 className="font-semibold text-white">{page.title}</h3>
                      <p className="text-xs text-slate-500">{pageLinks.length} links · {page.views} views</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-slate-700 hover:border-[#25D366] px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors">
                      <ExternalLink className="h-3 w-3" /> View
                    </a>
                    <button onClick={() => copy(page.id, url)}
                      className="flex items-center gap-1.5 rounded-full border border-slate-700 hover:border-[#25D366] px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors">
                      {copied === page.id ? <Check className="h-3.5 w-3.5 text-[#25D366]" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === page.id ? "Copied!" : "Copy"}
                    </button>
                    <button onClick={() => del(page.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1.5">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="bg-slate-900 rounded-xl px-3 py-2 text-xs text-slate-400 font-mono mb-3">{url}</div>
                <div className="flex flex-wrap gap-2">
                  {pageLinks.map((l, i) => (
                    <span key={i} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{l.label}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
