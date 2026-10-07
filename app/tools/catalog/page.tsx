"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Copy, Check, Trash2, Plus, X, Store, Eye, Loader2, Crown, ExternalLink, TrendingUp } from "lucide-react";

interface Cat { id: string; slug: string; title: string; views: number; count: number; inquiries: number; won: number; }
interface Order { id: string; leadId: string | null; itemName: string; itemPrice: string; customerName: string | null; customerPhone: string | null; customerEmail: string | null; status: string; createdAt: string; catalogPage: { title: string; slug: string }; }
interface Row { name: string; price: string; desc: string; }
const DIALS = ["971","966","974","965","973","968","1","44","91","20","961","962"];

export default function CatalogToolPage() {
  const { status: sessionStatus } = useSession();
  const [cats, setCats] = useState<Cat[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [dial, setDial] = useState("971");
  const [phone, setPhone] = useState("");
  const [slug, setSlug] = useState("");
  const [rows, setRows] = useState<Row[]>([{ name: "", price: "", desc: "" }]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("https://wazap.lt");

  useEffect(() => {
    setOrigin(window.location.origin);
    if (sessionStatus === "authenticated") load();
    if (sessionStatus === "unauthenticated") setLoading(false);
  }, [sessionStatus]);
  async function load() {
    const [catalogResponse, orderResponse] = await Promise.all([fetch("/api/catalog"), fetch("/api/catalog/orders")]);
    if (catalogResponse.ok) setCats(await catalogResponse.json());
    if (orderResponse.ok) setOrders(await orderResponse.json());
    setLoading(false);
  }
  async function updateOrder(id: string, status: string) {
    const response = await fetch("/api/catalog/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (response.ok) { setOrders(current => current.map(order => order.id === id ? { ...order, status } : order)); load(); }
  }

  function setRow(i: number, k: keyof Row, v: string) { setRows(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r)); }
  function addRow() { setRows(rs => [...rs, { name: "", price: "", desc: "" }]); }
  function rmRow(i: number) { setRows(rs => rs.filter((_, j) => j !== i)); }

  async function create() {
    setError(""); setUpgrade(false);
    if (sessionStatus !== "authenticated") { setError("Sign in or create a free account to publish your catalog."); return; }
    const items = rows.filter(r => r.name.trim());
    if (!title.trim() || !phone.trim() || items.length === 0) { setError("Add a title, number, and at least one item."); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/catalog", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, bio, phone: dial + phone, items, slug }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Could not publish."); setUpgrade(!!d.upgrade); return; }
      setTitle(""); setBio(""); setPhone(""); setSlug(""); setRows([{ name: "", price: "", desc: "" }]);
      load();
    } finally { setCreating(false); }
  }
  async function del(id: string) {
    if (!confirm("Delete this catalog page? Its link will stop working.")) return;
    await fetch("/api/catalog", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setCats(c => c.filter(x => x.id !== id));
  }
  function copy(t: string, k: string) { navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(""), 1500); }

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 h-10 flex items-center gap-3 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Catalog / Order Page</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-yellow-400"><Crown className="h-3 w-3" /> Paid</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">WhatsApp Catalog &amp; Order Page</h1>
            <p className="text-slate-400">Publish a shareable page of your products or services — each one has an <span className="text-[#25D366]">Order on WhatsApp</span> button that opens a chat with a pre-filled order.</p>
          </div>

          {/* Builder */}
          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-3">
            <div className="flex items-center gap-2 mb-1"><Store className="h-4 w-4 text-[#25D366]" /><span className="text-sm font-medium text-white">Build your page</span></div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Page title (e.g. Sara's Bakery)" className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
            <input value={bio} onChange={e => setBio(e.target.value)} placeholder="Short description (optional)" className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
            <div className="flex gap-2">
              <select value={dial} onChange={e => setDial(e.target.value)} className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#25D366]">{DIALS.map(d => <option key={d} value={d}>+{d}</option>)}</select>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="WhatsApp number for orders" inputMode="tel" className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] font-mono" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-mono shrink-0">{origin.replace(/^https?:\/\//,"")}/c/</span>
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="custom-link (optional)" className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] font-mono" />
            </div>

            <div className="pt-2 space-y-2">
              <div className="text-xs font-medium text-slate-400">Items</div>
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input value={r.name} onChange={e => setRow(i, "name", e.target.value)} placeholder="Item name" className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                    <input value={r.price} onChange={e => setRow(i, "price", e.target.value)} placeholder="Price (e.g. 25 AED)" className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                    <input value={r.desc} onChange={e => setRow(i, "desc", e.target.value)} placeholder="Description (optional)" className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                  </div>
                  {rows.length > 1 && <button onClick={() => rmRow(i)} className="mt-2 text-slate-600 hover:text-red-400"><X className="h-4 w-4" /></button>}
                </div>
              ))}
              <button onClick={addRow} className="inline-flex items-center gap-1 text-xs text-[#25D366] hover:underline"><Plus className="h-3.5 w-3.5" /> Add item</button>
            </div>

            {error && <p className="text-sm text-red-400">{error} {upgrade && <Link href="/pricing" className="underline text-[#25D366]">Upgrade →</Link>}</p>}
            <button onClick={create} disabled={creating} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-50 py-3 text-sm font-bold text-black transition-colors">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Publish catalog</button>
          </div>

          {/* List */}
          {loading ? <p className="text-center text-slate-600 text-sm">Loading…</p> : cats.length === 0 ? (
            <p className="text-center text-slate-600 text-sm">No catalog pages yet. Build your first one above.</p>
          ) : (
            <div className="space-y-3">
              {cats.map(c => {
                const url = `${origin}/c/${c.slug}`;
                return (
                  <div key={c.id} className="rounded-2xl border border-slate-800 bg-[#111811] p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{c.title}</div>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-[#25D366] hover:underline truncate">{url.replace(/^https?:\/\//,"")}</a>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{c.count} items</span>
                      <span className="inline-flex items-center gap-1 text-sm text-slate-300"><Eye className="h-4 w-4 text-[#25D366]" /> {c.views.toLocaleString()}</span>
                      <span className="inline-flex items-center gap-1 text-sm text-slate-300" title="Order clicks"><TrendingUp className="h-4 w-4 text-[#25D366]" /> {c.inquiries} leads · {c.won} won</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-[#25D366]"><ExternalLink className="h-4 w-4" /></a>
                      <button onClick={() => copy(url, c.id)} className="text-slate-400 hover:text-[#25D366]">{copied === c.id ? <Check className="h-4 w-4 text-[#25D366]" /> : <Copy className="h-4 w-4" />}</button>
                      <button onClick={() => del(c.id)} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {orders.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5 space-y-3">
              <div>
                <h2 className="font-semibold text-white">Order conversion tracker</h2>
                <p className="text-xs text-slate-500 mt-1">Identified inquiries become Flow leads automatically. Updating an outcome keeps the linked pipeline stage in sync.</p>
              </div>
              {orders.map(order => (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{order.itemName} {order.itemPrice && <span className="text-[#25D366]">· {order.itemPrice}</span>}</div>
                    <div className="text-xs text-slate-500">{order.customerName || "Anonymous visitor"}{order.customerPhone ? ` · ${order.customerPhone}` : ""} · {order.catalogPage.title} · {new Date(order.createdAt).toLocaleString()}</div>
                    {order.leadId && <Link href="/tools/follow-up" className="mt-1 inline-block text-[11px] font-semibold text-[#25D366] hover:underline">Open in Wazap Flow →</Link>}
                  </div>
                  <select value={order.status} onChange={event => updateOrder(order.id, event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">
                    <option value="inquiry">Inquiry</option><option value="quoted">Quoted</option><option value="won">Won</option><option value="lost">Lost</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
