"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { MessageCircle, Check, X, ExternalLink, ClipboardList } from "lucide-react";

interface Result { raw: string; clean: string; valid: boolean; url: string; }

function parseNumber(raw: string): Result {
  const clean = raw.replace(/[\s\-().+]/g, "");
  const valid = /^\d{7,15}$/.test(clean);
  return { raw: raw.trim(), clean, valid, url: `https://wa.me/${clean}` };
}

export default function NumberCheckerPage() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [checked, setChecked] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState<number>(10);
  const [plan, setPlan] = useState("free");
  const [limitError, setLimitError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tools/use?tool=checker")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setRemaining(d.remaining === -1 ? null : d.remaining);
        setLimit(d.limit === -1 ? Infinity : d.limit);
        setPlan(d.plan);
      })
      .catch(() => {});
  }, []);

  async function check() {
    const lines = input.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setLimitError(null);

    try {
    const res = await fetch("/api/tools/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "checker", count: lines.length }),
    });
    const data = await res.json();

    if (res.status === 429) {
      setLimitError(`Daily limit of ${data.limit} numbers reached. Resets at midnight.`);
      return;
    }

    if (!res.ok) throw new Error(data.error || "Number validation could not be completed. Please try again.");
    setRemaining(data.remaining === -1 ? null : data.remaining);
    setResults(lines.map(parseNumber));
    setChecked(true);    } catch (error) {
      setLimitError(error instanceof Error ? error.message : "Number validation could not be completed. Please try again.");
    }
  }

  const inputCount = input.split("\n").filter(Boolean).length;
  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);
  const atLimit = remaining !== null && remaining <= 0;

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 min-h-10 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Number Formatter</span>
        {remaining !== null && (
          <span className="ml-auto text-xs text-slate-500">{remaining}/{limit === Infinity ? "∞" : limit} checks today</span>
        )}
        {plan === "free" && <Link href="/pricing" className="text-xs text-[#25D366] hover:underline">Upgrade</Link>}
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">WhatsApp Number Formatter</h1>
            <p className="text-slate-400">Clean international phone-number formats and generate direct wa.me links. This does not confirm WhatsApp registration.</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="h-4 w-4 text-[#25D366]" />
              <span className="text-sm font-medium text-white">Paste numbers (one per line)</span>
            </div>
            <p className="text-xs text-slate-500">Include country code. Examples: <code className="text-slate-400">971501234567</code> or <code className="text-slate-400">+44 7700 900123</code></p>
            <textarea aria-label="Phone numbers, one per line" value={input} onChange={e => setInput(e.target.value)} rows={10}
              placeholder={`971501234567\n447700900123\n15551234567\n...`}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] resize-none font-mono" />

            {limitError && (
              <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {limitError} {plan === "free" && <Link href="/pricing" className="underline ml-1">Upgrade for more</Link>}
              </div>
            )}

            <button onClick={check} disabled={atLimit || !input.trim()}
              className="w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-40 disabled:cursor-not-allowed py-3 text-sm font-bold text-black transition-colors">
              {atLimit ? "Daily limit reached" : `Validate ${inputCount > 0 ? `${inputCount} Numbers` : "Numbers"}`}
            </button>
            {atLimit && (
              <p className="text-center text-xs text-amber-400">
                {limit} checks/day on {plan} plan. <Link href="/pricing" className="underline">Upgrade for more</Link>
              </p>
            )}
          </div>

          {checked && results.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Total", value: results.length, color: "text-white" },
                  { label: "Valid", value: valid.length, color: "text-[#25D366]" },
                  { label: "Invalid", value: invalid.length, color: "text-red-400" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-slate-800 bg-[#111811] p-4 text-center">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-[#111811] overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Results</span>
                  <button onClick={() => {
                    const lines = valid.map(r => r.url).join("\n");
                    navigator.clipboard.writeText(lines);
                  }} className="text-xs text-[#25D366] hover:underline">Copy valid links</button>
                </div>
                <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        {r.valid
                          ? <Check className="h-4 w-4 text-[#25D366] shrink-0" />
                          : <X className="h-4 w-4 text-red-400 shrink-0" />}
                        <div>
                          <div className="text-sm text-white font-mono">{r.raw}</div>
                          {!r.valid && <div className="text-xs text-red-400">Invalid format</div>}
                        </div>
                      </div>
                      {r.valid && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[#25D366] hover:underline">
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
