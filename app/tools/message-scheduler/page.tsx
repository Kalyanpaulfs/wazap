"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Clock3, ExternalLink } from "lucide-react";
import { recordToolUse } from "@/lib/tool-activity-client";
function esc(v: string) {
  return v.replace(/[\\,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
}
export default function Page() {
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [when, setWhen] = useState("");
  const [error, setError] = useState("");
  async function calendar() {
    if (!validNumber || !message.trim() || !when) return;
    if (!Number.isFinite(new Date(when).getTime()) || new Date(when).getTime() <= Date.now()) {
      setError("Choose a future date and time."); return;
    }
    setError("");
    try { await recordToolUse("messageScheduler", "calendar_reminder"); }
    catch (e) { setError(e instanceof Error ? e.message : "Reminder could not be created."); return; }
    const d = new Date(when),
      end = new Date(d.getTime() + 15 * 60000),
      fmt = (x: Date) =>
        x
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "");
    const url = `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Wazap//Message Reminder//EN\r\nBEGIN:VEVENT\r\nUID:${crypto.randomUUID()}@wazap.lt\r\nDTSTAMP:${fmt(new Date())}\r\nDTSTART:${fmt(d)}\r\nDTEND:${fmt(end)}\r\nSUMMARY:${esc("Send WhatsApp message")}\r\nDESCRIPTION:${esc(message + "\n" + url)}\r\nURL:${url}\r\nBEGIN:VALARM\r\nTRIGGER:-PT5M\r\nACTION:DISPLAY\r\nDESCRIPTION:Send WhatsApp message\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "wazap-message-reminder.ics";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const validNumber = /^[1-9]\d{6,14}$/.test(number.replace(/\D/g, ""));
  const link = `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
  return (
    <main className="hero-bg min-h-[80vh] px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <Link href="/tools" className="text-sm text-slate-500">
          ← Tools
        </Link>
        <div className="mt-8 text-center">
          <Clock3 className="mx-auto h-11 w-11 text-[#25D366]" />
          <h1 className="mt-4 text-4xl font-bold text-white">
            WhatsApp Message Scheduler
          </h1>
          <p className="mt-3 text-slate-400">
            Prepare the message now and add a secure calendar reminder to send
            it at the right time.
          </p>
        </div>
        <div className="mt-10 space-y-4 rounded-3xl border border-slate-800 bg-[#111811] p-6">
          <input aria-label="Recipient number with country code"
            inputMode="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Recipient number with country code"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-white"
          />
          <textarea aria-label="Message to send…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="Message to send…"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-white"
          />
          <input
            aria-label="Reminder date and time"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-white [color-scheme:dark]"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              disabled={!when || !validNumber || !message.trim()}
              onClick={calendar}
              className="flex items-center justify-center gap-2 rounded-full bg-[#25D366] py-3 text-sm font-bold text-black disabled:opacity-40"
            >
              <CalendarPlus className="h-4 w-4" />
              Add calendar reminder
            </button>
            <a
              href={validNumber && message.trim() ? link : undefined}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center justify-center gap-2 rounded-full border border-slate-700 py-3 text-sm font-semibold text-white ${!validNumber || !message.trim() ? "pointer-events-none opacity-40" : ""}`}
            >
              <ExternalLink className="h-4 w-4" />
              Open prepared chat
            </a>
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <p className="text-xs text-slate-400">Use 7–15 digits including the country code. The date and time use your device’s local time zone.</p>
          <p className="text-xs leading-relaxed text-slate-500">
            For reliability and consent, Wazap creates a calendar reminder and
            prepared WhatsApp link. It does not auto-send messages or bypass
            WhatsApp’s rules.
          </p>
        </div>
      </div>
    </main>
  );
}
