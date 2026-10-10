"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Clock3,
  MessageCircle,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { recordToolUse } from "@/lib/tool-activity-client";

import { parseWhatsAppChat, type ChatDateOrder } from "@/lib/chat-export";
export default function Page() {
  const [draft, setDraft] = useState("");
  const [raw, setRaw] = useState("");
  const [dateOrder, setDateOrder] = useState<ChatDateOrder>("day-first");
  const [analyzedOrder, setAnalyzedOrder] = useState<ChatDateOrder>("day-first");
  const [error, setError] = useState("");
  const rows = useMemo(() => parseWhatsAppChat(raw, analyzedOrder), [raw, analyzedOrder]);
  const stats = useMemo(() => {
    const senders = new Map<string, number>();
    const hours = Array(24).fill(0);
    let words = 0;
    rows.forEach((r) => {
      senders.set(r.sender, (senders.get(r.sender) || 0) + 1);
      hours[r.date.getHours()]++;
      words += r.text.trim().split(/\s+/).filter(Boolean).length;
    });
    const top = [...senders].sort((a, b) => b[1] - a[1]);
    const peak = hours.indexOf(Math.max(...hours));
    return { top, peak, words };
  }, [rows]);
  return (
    <main className="hero-bg min-h-[80vh] px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <Link href="/tools" className="text-sm text-slate-500 hover:text-white">
          ← Tools
        </Link>
        <div className="mt-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366]/10">
            <BarChart3 className="text-[#25D366]" />
          </div>
          <h1 className="mt-4 text-4xl font-bold text-white">
            WhatsApp Chat Insights
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">
            Upload an exported .txt chat to reveal activity, message share and
            peak hours. Analysis stays inside your browser.
          </p>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-300 hover:border-[#25D366]">
              <Upload className="h-4 w-4" />
              Upload WhatsApp .txt
              <input
                type="file"
                accept=".txt,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setDraft(await f.text());
                }}
              />
            </label>
            <label htmlFor="chat-export" className="mt-4 block text-sm text-slate-300">Exported chat text</label>
            <textarea id="chat-export"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={13}
              placeholder="Or paste an exported chat here…"
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-xs text-white outline-none focus:border-[#25D366]"
            />
            <label htmlFor="chat-date-order" className="mt-3 block text-sm text-slate-300">Export date order</label>
            <select id="chat-date-order" value={dateOrder} onChange={e => setDateOrder(e.target.value as ChatDateOrder)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white">
              <option value="day-first">Day / month / year</option><option value="month-first">Month / day / year</option>
            </select>
            <button disabled={!draft.trim()} onClick={async () => {
              setError("");
              try {
                if (!parseWhatsAppChat(draft, dateOrder).length) throw new Error("No WhatsApp messages were recognized. Export without media and use the .txt file.");
                await recordToolUse("chatInsights", "analyze");
                setAnalyzedOrder(dateOrder);
                setRaw(draft);
              } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed."); }
            }} className="mt-3 w-full rounded-full bg-[#25D366] py-3 text-sm font-bold text-black disabled:opacity-40">Analyze chat</button>
            {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
            <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Private by design — the file is not uploaded to Wazap.
            </p>
          </section>
          <section className="space-y-4">
            {[
              {
                icon: MessageCircle,
                label: "Messages parsed",
                value: rows.length.toLocaleString(),
              },
              {
                icon: Clock3,
                label: "Busiest hour",
                value: rows.length
                  ? `${String(stats.peak).padStart(2, "0")}:00`
                  : "—",
              },
              {
                icon: BarChart3,
                label: "Words analyzed",
                value: stats.words.toLocaleString(),
              },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-800 bg-[#111811] p-5"
              >
                <Icon className="h-5 w-5 text-[#25D366]" />
                <p className="mt-3 text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <p className="font-semibold text-white">Message share</p>
              <div className="mt-4 space-y-3">
                {stats.top.slice(0, 6).map(([name, count]) => (
                  <div key={name}>
                    <div className="flex justify-between text-xs">
                      <span className="truncate text-slate-300">{name}</span>
                      <span className="text-slate-500">{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded bg-slate-800">
                      <div
                        className="h-full rounded bg-[#25D366]"
                        style={{
                          width: `${rows.length ? (count / rows.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                {!rows.length && (
                  <p className="text-sm text-slate-600">
                    Upload a chat to see results.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
