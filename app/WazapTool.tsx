"use client";

import { useState, useEffect } from "react";
import { MessageCircle, Send, Clock, X } from "lucide-react";
import CountryPicker from "./CountryPicker";

const STORAGE_KEY = "wazap_history";

interface HistoryEntry {
  dial: string;
  number: string;
  message: string;
  ts: number;
}

export default function WazapTool() {
  const [dial, setDial] = useState("+971");
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const saved = JSON.parse(stored) as HistoryEntry[];
        queueMicrotask(() => setHistory(saved));
      }
    } catch {}
  }, []);

  function openWhatsApp() {
    const clean = number.replace(/\D/g, "");
    if (!clean) return;
    const fullNumber = `${dial.replace("+", "")}${clean}`;
    const url = message.trim()
      ? `https://wa.me/${fullNumber}?text=${encodeURIComponent(message.trim())}`
      : `https://wa.me/${fullNumber}`;
    window.open(url, "_blank", "noopener,noreferrer");
    void fetch("/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "first_tool_success", source: "open_chat" }),
      keepalive: true,
    });
    try {
      const entry: HistoryEntry = { dial, number: clean, message: message.trim(), ts: Date.now() };
      const updated = [entry, ...history].slice(0, 20);
      setHistory(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }

  function openFromHistory(entry: HistoryEntry) {
    const fullNumber = `${entry.dial.replace("+", "")}${entry.number}`;
    const url = entry.message
      ? `https://wa.me/${fullNumber}?text=${encodeURIComponent(entry.message)}`
      : `https://wa.me/${fullNumber}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function removeHistory(ts: number) {
    const updated = history.filter(h => h.ts !== ts);
    setHistory(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  }


  return (
    <div className="space-y-3">
      {/* Main card */}
      <div className="rounded-2xl border border-slate-800 bg-[#111811] p-4 sm:p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="h-5 w-5 text-[#25D366]" />
          <span className="font-semibold text-white text-sm sm:text-base">Open WhatsApp Chat</span>
          <span className="ml-auto text-xs text-[#25D366]">Free &amp; unlimited</span>
        </div>

        {/* Country + Number */}
        <div className="flex gap-2 mb-3">
          <CountryPicker value={dial} onChange={setDial} />
          <input
            type="tel"
            inputMode="numeric"
            value={number}
            onChange={e => setNumber(e.target.value)}
            onKeyDown={e => e.key === "Enter" && openWhatsApp()}
            placeholder="Phone number"
            className="flex-1 min-w-0 rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-[#25D366] transition-colors text-base"
          />
        </div>

        {/* Message */}
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Message (optional)"
          rows={2}
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#25D366] transition-colors resize-none mb-3"
        />

        {/* Button */}
        <button
          onClick={openWhatsApp}
          disabled={!number.trim()}
          className="w-full flex items-center justify-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1fba58] active:bg-[#1aaa4f] disabled:opacity-40 disabled:cursor-not-allowed py-4 text-base font-bold text-black transition-colors"
        >
          <Send className="h-5 w-5" />
          Open in WhatsApp
        </button>

      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-[#111811] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-400">Recent</span>
          </div>
          <div className="space-y-2">
            {history.slice(0, 5).map(entry => (
              <div key={entry.ts} className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5">
                <button onClick={() => openFromHistory(entry)} className="flex-1 text-left min-w-0">
                  <span className="text-white text-sm font-medium">{entry.dial} {entry.number}</span>
                  {entry.message && (
                    <span className="text-slate-500 text-xs ml-2 truncate inline-block max-w-[120px] align-bottom">&ldquo;{entry.message}&rdquo;</span>
                  )}
                </button>
                <button onClick={() => openFromHistory(entry)}
                  className="shrink-0 w-8 h-8 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                  <MessageCircle className="h-4 w-4 text-[#25D366]" />
                </button>
                <button onClick={() => removeHistory(entry.ts)}
                  className="shrink-0 text-slate-600 hover:text-red-400 transition-colors p-1">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
