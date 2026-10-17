"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Trash2, Copy, Check, RefreshCw } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
import PlanPausedBadge from "@/app/components/PlanPausedBadge";
import RotatorQR from "./RotatorQR";

interface Rotator { id: string; name: string; fallbackNumber?: string | null; message?: string | null; code: string; numbers: string[]; numberNames?: Record<string, string> | null; totalClicks: number; last30Days: number; destinationClicks: Record<string, number>; createdAt: string; planPausedAt?: string | null; }
interface RouterQuota { plan: string; limit: number | null; used: number; remaining: number | null; allowed: boolean; grace: boolean; graceEndsAt: string | null; }
interface PlanLimits { plan: string; planLabel: string; rotators: number; numbersPerRotator: number; }
interface NumberRow { name: string; number: string; }

function digitsOnly(value: string) { return value.replace(/\D/g, ""); }

export default function RotatorPage() {
  const [rotators, setRotators] = useState<Rotator[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [dial, setDial] = useState("971");
  const [rows, setRows] = useState<NumberRow[]>([{ name: "", number: "" }, { name: "", number: "" }]);
  const [quota, setQuota] = useState<RouterQuota | null>(null);
  const [limits, setLimits] = useState<PlanLimits | null>(null);

  useEffect(() => { fetchRotators(); }, []);

  async function fetchRotators() {
    const res = await fetch("/api/rotator");
    if (res.ok) {
      const data = await res.json();
      setRotators(data.rotators ?? []);
      setQuota(data.quota ?? null);
      setLimits(data.limits ?? null);
      setAuthRequired(false);
    } else if (res.status === 401) {
      setAuthRequired(true);
    }
    setLoading(false);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const numbers = rows.map(r => dial + digitsOnly(r.number)).filter(n => n.replace(dial, "").length > 5);
    if (!name || numbers.length < 2) return;
    const numberNames: Record<string, string> = {};
    rows.forEach(r => {
      const number = dial + digitsOnly(r.number);
      if (r.name.trim() && number.replace(dial, "").length > 5) numberNames[number] = r.name.trim();
    });
    setError("");
    setCreating(true);
    const res = await fetch("/api/rotator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, numbers, numberNames, message }),
    });
    if (res.ok) {
      await fetchRotators();
      window.gtag?.("event", "rotator_created");
      setName("");
      setMessage("");
      setRows([{ name: "", number: "" }, { name: "", number: "" }]);
    } else {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) setAuthRequired(true);
      setError(data.error || "Could not create the rotator. Please try again.");
    }
    setCreating(false);
  }

  async function del(id: string) {
    if (!window.confirm("Delete this rotator? Its public link will stop working. This cannot be undone.")) return;
    const res = await fetch("/api/rotator", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) { setError("Could not delete the rotator. Please try again."); return; }
    setRotators(r => r.filter(x => x.id !== id));
  }

  async function saveRotator(id: string, payload: { name: string; numbers: string[]; numberNames: Record<string, string>; fallbackNumber: string; message: string }) {
    setSaving(id);
    setError("");
    try {
      const res = await fetch("/api/rotator", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || "Could not save the rotator."); }
      await fetchRotators();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the rotator."); }
    finally { setSaving(null); }
  }

  function getUrl(code: string) { return `${window.location.origin}/r/${code}`; }

  function copy(id: string, url: string) {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 min-h-10 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Link Rotator</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">WhatsApp Lead Router</h1>
            <p className="text-slate-400">One trackable link that rotates click-to-chat handoffs across your configured WhatsApp numbers.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-800 px-3 py-1">No API setup</span>
              <span className="rounded-full border border-slate-800 px-3 py-1">No QR scan</span>
              <span className="rounded-full border border-slate-800 px-3 py-1">No chat-content access</span>
            </div>
          </div>

          {quota && quota.plan === "free" && (
            <div className={`rounded-2xl border p-5 ${quota.allowed ? "border-[#25D366]/30 bg-[#25D366]/10" : "border-amber-400/30 bg-amber-400/10"}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-white">{quota.grace ? "Existing links remain live during your transition period" : "Your free trial has ended — links paused"}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {quota.grace && quota.graceEndsAt
                      ? `Free routing ends ${new Date(quota.graceEndsAt).toLocaleDateString()}. Choose a plan before then to keep every link live.`
                      : "Choose a plan to resume routing. Solo gives unlimited leads for $9/month."}
                  </p>
                </div>
                <Link href="/pricing?source=rotator_quota" className="rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">Choose a plan</Link>
              </div>
            </div>
          )}

          <form onSubmit={create} className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
            <h2 className="font-semibold text-white flex items-center gap-2"><Plus className="h-4 w-4 text-[#25D366]" /> New Rotator</h2>
            {authRequired && (
              <div className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-4 text-sm">
                <p className="font-semibold text-white">Create a free account to save your rotator</p>
                <p className="mt-1 text-slate-400">Start a 3-day free trial with everything in Solo — no card needed. Sign up, then return here to create and track it.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link href="/signup?redirect=/tools/rotator" className="rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-black hover:bg-[#1fba58]">Sign Up Free</Link>
                  <Link href="/login?redirect=/tools/rotator" className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-white hover:border-[#25D366]">Log In</Link>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-slate-400 block mb-1">Rotator Name</label>
              <input aria-label="e.g. Sales Team" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sales Team"
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-2">Country Code (applies to all)</label>
              <select value={dial} onChange={e => setDial(e.target.value)}
                className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#25D366]">
                {COUNTRIES.map(c => <option key={c.code} value={c.dial.replace("+","")}>{c.dial} {c.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 block">
                Salespeople (min 2){limits && <span className="text-slate-500"> · {rows.length} of {limits.numbersPerRotator}</span>}
              </label>
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input value={row.name} onChange={e => setRows(prev => prev.map((v, j) => j === i ? { ...v, name: e.target.value } : v))}
                    placeholder="e.g. Ravi" aria-label={`Salesperson ${i + 1} name (optional)`}
                    className="min-w-0 w-28 sm:w-36 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                  <input value={row.number} onChange={e => setRows(prev => prev.map((v, j) => j === i ? { ...v, number: e.target.value } : v))}
                    placeholder={`Agent ${i + 1} phone number`} aria-label={`Salesperson ${i + 1} phone number`}
                    className="min-w-0 flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
                  {rows.length > 2 && (
                    <button type="button" onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-600 hover:text-red-400 p-2 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {limits && rows.length >= limits.numbersPerRotator ? (
                <p className="text-xs text-amber-400">
                  Your {limits.planLabel} plan allows {limits.numbersPerRotator} numbers per rotator. <Link href="/pricing" className="underline">Upgrade</Link> to add more.
                </p>
              ) : (
                <button type="button" onClick={() => setRows(prev => [...prev, { name: "", number: "" }])}
                  className="text-xs text-[#25D366] hover:underline">+ Add salesperson</button>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1" htmlFor="rotator-message">Predefined WhatsApp message (optional)</label>
              <textarea id="rotator-message" maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} placeholder="Hi, I’d like more information." className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white" />
              <p className="text-xs text-slate-500 mt-1">Shown in WhatsApp for every destination. The visitor chooses whether to send it.</p>
            </div>
            {error && !authRequired && <p role="alert" className="text-sm text-red-400">{error}</p>}
            {limits && !authRequired && (
              <p className="text-xs text-slate-500">
                {rotators.length} of {limits.rotators} rotators on your {limits.planLabel} plan
                {rotators.length >= limits.rotators && <> · <Link href="/pricing" className="text-[#25D366] underline">Upgrade for more</Link></>}
              </p>
            )}
            <button type="submit" disabled={creating || authRequired}
              className="rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-50 px-6 py-2.5 text-sm font-bold text-black transition-colors">
              {authRequired ? "Sign up above to create" : creating ? "Creating..." : "Create Rotator"}
            </button>
          </form>

          {loading ? (
            <div className="text-center text-slate-500 py-8">Loading...</div>
          ) : rotators.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-500">No rotators yet. Create one above.</div>
          ) : (
            <div className="space-y-4">
              <h2 className="font-semibold text-white">Your Rotators</h2>
              {rotators.map(r => {
                const url = typeof window !== "undefined" ? getUrl(r.code) : "";
                return (
                  <div key={r.id} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                      <div>
                        <div className="flex items-center gap-2"><h3 className="font-semibold text-white">{r.name}</h3>{r.planPausedAt && <PlanPausedBadge />}</div>
                        <p className="text-xs text-slate-500 mt-0.5">{r.numbers.length} destinations · {r.totalClicks} total routed handoffs · {r.last30Days} in the last 30 days</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-full bg-[#25D366]/10 border border-[#25D366]/30 px-3 py-1">
                          <RefreshCw className="h-3.5 w-3.5 text-[#25D366]" />
                          <span className="text-sm font-bold text-[#25D366]">{r.totalClicks}</span>
                        </div>
                        <button onClick={() => copy(r.id, url)}
                          className="flex items-center gap-1.5 rounded-full border border-slate-700 hover:border-[#25D366] px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors">
                          {copied === r.id ? <Check className="h-3.5 w-3.5 text-[#25D366]" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied === r.id ? "Copied!" : "Copy Link"}
                        </button>
                        <button onClick={() => del(r.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1.5">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <RotatorEditForm
                      key={`${r.id}:${r.numbers.join(",")}:${JSON.stringify(r.numberNames ?? {})}`}
                      rotator={r}
                      limits={limits}
                      saving={saving === r.id}
                      onSave={payload => saveRotator(r.id, payload)}
                    />
                    <div className="bg-slate-900 rounded-xl px-3 py-2 text-xs text-slate-400 font-mono">{url}</div>
                    <RotatorQR url={url} name={r.name} />
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {r.numbers.map((n, i) => {
                        const label = r.numberNames?.[n];
                        return (
                          <div key={i} className="flex items-center justify-between rounded-xl bg-slate-900 px-3 py-2 text-xs">
                            {label ? (
                              <span>
                                <span className="block font-semibold text-white">{label}</span>
                                <span className="block font-mono text-slate-500">+{n}</span>
                              </span>
                            ) : (
                              <span className="font-mono text-slate-400">+{n}</span>
                            )}
                            <span className="font-semibold text-[#25D366]">{r.destinationClicks?.[n] ?? 0} routed / 30d</span>
                          </div>
                        );
                      })}
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

function RotatorEditForm({
  rotator,
  limits,
  saving,
  onSave,
}: {
  rotator: Rotator;
  limits: PlanLimits | null;
  saving: boolean;
  onSave: (payload: { name: string; numbers: string[]; numberNames: Record<string, string>; fallbackNumber: string; message: string }) => void;
}) {
  const [name, setName] = useState(rotator.name);
  const [rows, setRows] = useState<NumberRow[]>(() =>
    rotator.numbers.map(n => ({ number: n, name: rotator.numberNames?.[n] ?? "" }))
  );
  const [fallbackNumber, setFallbackNumber] = useState(rotator.fallbackNumber || rotator.numbers[0] || "");
  const [message, setMessage] = useState(rotator.message || "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const numbers = rows.map(r => digitsOnly(r.number)).filter(Boolean);
    const numberNames: Record<string, string> = {};
    rows.forEach(r => {
      const number = digitsOnly(r.number);
      if (number && r.name.trim()) numberNames[number] = r.name.trim();
    });
    onSave({ name, numbers, numberNames, fallbackNumber: digitsOnly(fallbackNumber), message });
  }

  const atLimit = Boolean(limits && rows.length >= limits.numbersPerRotator);

  return (
    <form className="space-y-2" onSubmit={submit}>
      <label className="text-xs text-slate-400 block" htmlFor={`name-${rotator.id}`}>Router name</label>
      <input id={`name-${rotator.id}`} value={name} onChange={e => setName(e.target.value)} required maxLength={100} className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white" />

      <label className="text-xs text-slate-400 block">
        Salespeople{limits && <span className="text-slate-500"> · {rows.length} of {limits.numbersPerRotator}</span>}
      </label>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input value={row.name} onChange={e => setRows(prev => prev.map((v, j) => j === i ? { ...v, name: e.target.value } : v))}
              placeholder="e.g. Ravi" aria-label={`Salesperson ${i + 1} name (optional)`}
              className="min-w-0 w-28 sm:w-36 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600" />
            <input value={row.number} onChange={e => setRows(prev => prev.map((v, j) => j === i ? { ...v, number: e.target.value } : v))}
              placeholder="WhatsApp number" aria-label={`Salesperson ${i + 1} phone number`}
              className="min-w-0 flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600" />
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                className="text-slate-600 hover:text-red-400 p-2 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {atLimit ? (
        <p className="text-xs text-amber-400">
          Your {limits?.planLabel} plan allows {limits?.numbersPerRotator} numbers per rotator. <Link href="/pricing" className="underline">Upgrade</Link> to add more.
        </p>
      ) : (
        <button type="button" onClick={() => setRows(prev => [...prev, { name: "", number: "" }])}
          className="text-xs text-[#25D366] hover:underline">+ Add salesperson</button>
      )}

      <label className="text-xs text-slate-400 block" htmlFor={`fallback-${rotator.id}`}>Fallback number</label>
      <input id={`fallback-${rotator.id}`} value={fallbackNumber} onChange={e => setFallbackNumber(e.target.value)} className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white" />
      <label className="text-xs text-slate-400 block" htmlFor={`message-${rotator.id}`}>Predefined WhatsApp message</label>
      <textarea id={`message-${rotator.id}`} value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white" />
      <button disabled={saving} className="text-xs text-[#25D366] disabled:opacity-50">{saving ? "Saving…" : "Save router"}</button>
    </form>
  );
}
