"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { MessageCircle, Upload, Printer } from "lucide-react";

interface Msg { time: string; sender: string; text: string; isMe: boolean; }

function parseTranscript(raw: string): { msgs: Msg[]; participants: string[] } {
  const lines = raw.split("\n");
  const msgs: Msg[] = [];
  const participants = new Set<string>();
  const androidRe = /^(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\s*[-–]\s*([^:]+):\s(.+)$/i;
  const iosRe = /^\[(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)\]\s*([^:]+):\s(.+)$/i;
  let firstSender = "";
  for (const rawLine of lines) {
    const line = rawLine.replace(/[‎‏‪-‮⁦-⁩]/g, "");
    const m = line.match(androidRe) || line.match(iosRe);
    if (m) {
      const sender = m[2].trim();
      if (!firstSender) firstSender = sender;
      participants.add(sender);
      msgs.push({ time: m[1], sender, text: m[3], isMe: sender === firstSender });
    } else if (msgs.length > 0 && line.trim()) {
      msgs[msgs.length - 1].text += "\n" + line.trim();
    }
  }
  return { msgs, participants: Array.from(participants) };
}

export default function TranscriptPage() {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<{ msgs: Msg[]; participants: string[] } | null>(null);
  const [myName, setMyName] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [plan, setPlan] = useState("free");
  const [limitError, setLimitError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/tools/use?tool=transcript")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setRemaining(d.remaining === -1 ? null : d.remaining); setPlan(d.plan); } })
      .catch(() => {});
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setInput(ev.target?.result as string ?? "");
    reader.readAsText(file);
  }

  function parse() {
    const result = parseTranscript(input);
    setParsed(result);
    if (result.participants[0]) setMyName(result.participants[0]);
  }

  async function print() {
    setLimitError(null);
    const res = await fetch("/api/tools/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "transcript", count: 1 }),
    });
    const data = await res.json();
    if (res.status === 429) {
      setLimitError("Daily export limit reached. Resets at midnight.");
      return;
    }
    setRemaining(data.remaining === -1 ? null : data.remaining);

    const content = printRef.current?.innerHTML;
    if (!content) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>WhatsApp Transcript</title>
    <style>
      body{font-family:system-ui,sans-serif;background:#fff;padding:20px;max-width:700px;margin:0 auto;}
      .msg{margin:8px 0;display:flex;flex-direction:column;}
      .me{align-items:flex-end;}
      .them{align-items:flex-start;}
      .bubble{max-width:75%;padding:10px 14px;border-radius:18px;font-size:14px;line-height:1.5;}
      .me .bubble{background:#d9fdd3;color:#111;}
      .them .bubble{background:#f0f0f0;color:#111;}
      .meta{font-size:11px;color:#888;margin:2px 6px;}
    </style></head><body>${content}</body></html>`);
    w.document.close();
    w.print();
  }

  const atLimit = remaining !== null && remaining <= 0;
  const display = parsed ? parsed.msgs.map(m => ({ ...m, isMe: m.sender === myName })) : [];

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 h-10 flex items-center gap-3 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Transcript Exporter</span>
        {remaining !== null && (
          <span className="ml-auto text-xs text-slate-500">{remaining} export{remaining !== 1 ? "s" : ""} left today</span>
        )}
        {plan === "free" && <Link href="/pricing" className="text-xs text-[#25D366] hover:underline">Upgrade</Link>}
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">WhatsApp Transcript Exporter</h1>
            <p className="text-slate-400">Upload or paste your WhatsApp chat export (.txt) and get a clean, printable transcript.</p>
          </div>

          {!parsed ? (
            <div className="rounded-2xl border border-slate-800 bg-[#111811] p-6 space-y-4">
              <p className="text-xs text-slate-500">In WhatsApp: open a chat → ⋮ menu → More → Export Chat → Without Media → share the .txt file</p>
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border border-dashed border-slate-600 hover:border-[#25D366] px-6 py-4 w-full justify-center text-slate-400 hover:text-white transition-colors">
                <Upload className="h-5 w-5" /> Upload .txt export
              </button>
              <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFile} />
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-slate-700" />
                <span className="text-xs text-slate-600">or paste</span>
                <div className="flex-1 border-t border-slate-700" />
              </div>
              <textarea value={input} onChange={e => setInput(e.target.value)} rows={8} placeholder="Paste your WhatsApp export text here..."
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] resize-none font-mono" />
              <button onClick={parse} disabled={!input.trim()}
                className="w-full rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-40 py-3 text-sm font-bold text-black transition-colors">
                Parse Transcript
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">My name in chat:</span>
                  <select value={myName} onChange={e => setMyName(e.target.value)}
                    className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25D366]">
                    {parsed.participants.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span className="text-xs text-slate-500">{parsed.msgs.length} messages</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setParsed(null); setLimitError(null); }} className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-white">Reset</button>
                  <button onClick={print} disabled={atLimit}
                    className="flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 text-sm font-bold text-black">
                    <Printer className="h-4 w-4" /> {atLimit ? "Limit reached" : "Print / Save PDF"}
                  </button>
                </div>
              </div>

              {limitError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {limitError} {plan === "free" && <Link href="/pricing" className="underline ml-1">Upgrade for unlimited</Link>}
                </div>
              )}

              <div ref={printRef} className="rounded-2xl border border-slate-800 bg-[#111811] p-5 max-h-[600px] overflow-y-auto space-y-2">
                {display.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.isMe ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${msg.isMe ? "bg-[#25D366]/20 text-white rounded-br-sm" : "bg-slate-800 text-white rounded-bl-sm"}`}>
                      {!msg.isMe && <p className="text-xs text-[#25D366] font-semibold mb-1">{msg.sender}</p>}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>
                    <span className="text-xs text-slate-600 mt-1 mx-2">{msg.time}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
