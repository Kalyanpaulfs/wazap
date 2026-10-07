"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, ListChecks, ShieldCheck } from "lucide-react";

type Contact = { id: string; name: string; phone: string; opened: boolean };
type Usage = { usedToday: number; limit: number; remaining: number; plan: string; anonymous?: boolean };

const ANON_KEY = "wazap:bulk-opens";
const TODAY = () => new Date().toISOString().slice(0, 10);

function anonymousUsage() {
  try {
    const value = JSON.parse(localStorage.getItem(ANON_KEY) || "{}") as { date?: string; count?: number };
    return value.date === TODAY() ? Math.max(0, Number(value.count) || 0) : 0;
  } catch {
    return 0;
  }
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function parseContacts(raw: string): { contacts: Contact[]; invalid: number } {
  const seen = new Set<string>();
  let invalid = 0;
  const contacts: Contact[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/[,\t;]/).map((part) => part.trim());
    const phone = normalizePhone(parts.length > 1 ? parts.at(-1)! : parts[0]);
    const name = parts.length > 1 ? parts.slice(0, -1).join(" ").slice(0, 80) : "";
    if (phone.length < 7 || phone.length > 15 || seen.has(phone)) {
      invalid += 1;
      return;
    }
    seen.add(phone);
    contacts.push({ id: `${phone}-${index}`, name, phone, opened: false });
  });
  return { contacts: contacts.slice(0, 1000), invalid };
}

export default function BulkSenderPage() {
  const [rawContacts, setRawContacts] = useState("");
  const [message, setMessage] = useState("Hi {name}, ");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invalid, setInvalid] = useState(0);
  const [consent, setConsent] = useState(false);
  const [usage, setUsage] = useState<Usage>({ usedToday: 0, limit: 10, remaining: 10, plan: "free", anonymous: true });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/tools/use?tool=bulk", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Usage) => {
        if (data.anonymous) {
          const usedToday = anonymousUsage();
          setUsage({ ...data, usedToday, remaining: Math.max(0, data.limit - usedToday) });
        } else {
          setUsage(data);
        }
      })
      .catch(() => {});
  }, []);

  const pending = useMemo(() => contacts.filter((contact) => !contact.opened), [contacts]);

  function prepare() {
    const parsed = parseContacts(rawContacts);
    setContacts(parsed.contacts);
    setInvalid(parsed.invalid);
    setNotice(parsed.contacts.length ? `${parsed.contacts.length} valid contacts prepared locally.` : "Add at least one valid number with country code.");
  }

  async function uploadContacts(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setNotice("That file is larger than 2 MB. Split it into smaller CSV or TXT files.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseContacts(text);
      setRawContacts(text);
      setContacts(parsed.contacts);
      setInvalid(parsed.invalid);
      setNotice(parsed.contacts.length ? `${parsed.contacts.length} valid contacts imported locally from ${file.name}.` : "No valid international numbers were found in that file.");
    } catch {
      setNotice("Wazap could not read that file. Upload a UTF-8 CSV or TXT file.");
    }
  }

  async function openContact(contact: Contact) {
    if (!consent || !message.trim()) return;
    if (usage.limit !== -1 && usage.remaining <= 0) {
      setNotice("Your daily contact limit is reached. Upgrade or continue tomorrow.");
      return;
    }
    const personalized = message.replace(/\{name\}/gi, contact.name || "there");
    const popup = window.open(`https://wa.me/${contact.phone}?text=${encodeURIComponent(personalized)}`, "_blank");
    if (popup) popup.opener = null;
    if (!popup) {
      setNotice("Your browser blocked the WhatsApp tab. Allow pop-ups for Wazap and try again.");
      return;
    }
    setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, opened: true } : item));
    if (usage.anonymous) {
      const next = usage.usedToday + 1;
      localStorage.setItem(ANON_KEY, JSON.stringify({ date: TODAY(), count: next }));
      setUsage((current) => ({ ...current, usedToday: next, remaining: Math.max(0, current.limit - next) }));
    } else {
      void fetch("/api/tools/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: "bulk", count: 1 }),
        keepalive: true,
      }).then(async (response) => {
        const data = await response.json();
        if (response.ok) setUsage((current) => ({ ...current, usedToday: data.usedToday, remaining: data.remaining }));
      });
    }
    window.gtag?.("event", "bulk_chat_opened", { tool: "bulk", queue_size: contacts.length });
    setNotice(`Opened ${contact.name || contact.phone}. Review the message and tap Send inside WhatsApp.`);
  }

  return (
    <main className="hero-bg min-h-screen px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/tools" className="text-sm text-slate-500 hover:text-white">← All tools</Link>
        <header className="mt-6 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#25D366]">No API required · human reviewed</p>
          <h1 className="mt-3 text-4xl font-black text-white sm:text-5xl">Consent-Based WhatsApp Bulk Sender</h1>
          <p className="mt-4 text-lg leading-8 text-slate-400">Paste or upload an opted-in contact list, personalize one message, then open each chat in WhatsApp. Wazap does not upload your numbers or automatically press Send.</p>
        </header>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-5 rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7">
            <div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="bulk-contacts" className="font-semibold text-white">1. Contacts</label>
                <span className="text-xs text-slate-500">Name, international number · CSV or TXT</span>
              </div>
              <textarea id="bulk-contacts" value={rawContacts} onChange={(event) => setRawContacts(event.target.value)} rows={9} placeholder={"Amina,971501234567\nMarco,393331234567\n447700900123"} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 font-mono text-sm text-white outline-none focus:border-[#25D366]" />
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" onClick={prepare} className="rounded-full border border-[#25D366]/40 px-5 py-2 text-sm font-bold text-[#25D366] hover:bg-[#25D366]/10">Prepare queue</button>
                <label className="cursor-pointer rounded-full border border-slate-700 px-5 py-2 text-sm font-bold text-slate-300 hover:border-slate-500 hover:text-white">
                  Upload CSV or TXT
                  <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(event) => void uploadContacts(event.target.files?.[0])} />
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-500">Files are read only in this tab, limited to 2 MB and 1,000 unique contacts. Nothing is uploaded to Wazap.</p>
            </div>
            <div>
              <label htmlFor="bulk-message" className="font-semibold text-white">2. Message</label>
              <textarea id="bulk-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={6} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm text-white outline-none focus:border-[#25D366]" />
              <p className="mt-2 text-xs text-slate-500">Use <code className="text-[#25D366]">{"{name}"}</code> for optional personalization. Always review the final message in WhatsApp.</p>
            </div>
            <label className="flex cursor-pointer gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-[#25D366]" />
              <span className="text-sm leading-6 text-slate-300">I confirm every recipient consented to receive this message and I will honor opt-outs. I will not use this tool for purchased lists, cold spam, harassment, or deceptive content.</span>
            </label>
          </div>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-[#25D366]/25 bg-[#25D366]/5 p-5 sm:p-7">
              <div className="flex items-center gap-3"><ListChecks className="h-6 w-6 text-[#25D366]" /><h2 className="font-bold text-white">Send queue</h2></div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-black/20 p-3"><strong className="block text-xl text-white">{contacts.length}</strong><span className="text-slate-500">Valid</span></div>
                <div className="rounded-xl bg-black/20 p-3"><strong className="block text-xl text-white">{pending.length}</strong><span className="text-slate-500">Remaining</span></div>
                <div className="rounded-xl bg-black/20 p-3"><strong className="block text-xl text-white">{invalid}</strong><span className="text-slate-500">Skipped</span></div>
              </div>
              <button type="button" disabled={!pending.length || !consent || !message.trim() || (usage.limit !== -1 && usage.remaining <= 0)} onClick={() => pending[0] && openContact(pending[0])} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">
                Open next chat <ExternalLink className="h-4 w-4" />
              </button>
              <p className="mt-3 text-center text-xs text-slate-500">{usage.limit === -1 ? "Unlimited plan" : `${usage.remaining} of ${usage.limit} contacts remaining today`}</p>
              {notice && <p aria-live="polite" className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">{notice}</p>}
            </div>

            <div className="rounded-3xl border border-slate-800 bg-[#111811] p-5">
              <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[#25D366]" /><h2 className="font-semibold text-white">Privacy and safety</h2></div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
                <li>• Contacts and message text stay in this browser tab.</li>
                <li>• Wazap records only the number of chats opened for plan limits.</li>
                <li>• WhatsApp remains responsible for delivery and account enforcement.</li>
                <li>• Close each chat after sending, then return here for the next recipient.</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-amber-400/20 bg-amber-400/5 p-5">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-300">Automatic delivery</p>
              <h2 className="mt-2 font-semibold text-white">Waiting for official Meta API approval</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Unattended sends will activate only through an approved WhatsApp Business API connection with template approval, consent records, opt-out handling and delivery reporting. Wazap will not imitate WhatsApp Web or bypass Meta controls.</p>
            </div>
          </aside>
        </section>

        {contacts.length > 0 && (
          <section className="mt-6 rounded-3xl border border-slate-800 bg-[#111811] p-5">
            <h2 className="font-bold text-white">Prepared contacts</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {contacts.slice(0, 100).map((contact) => (
                <button key={contact.id} type="button" disabled={contact.opened || !consent || !message.trim()} onClick={() => openContact(contact)} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-left disabled:opacity-50">
                  <span className="min-w-0"><strong className="block truncate text-sm text-white">{contact.name || "Contact"}</strong><span className="text-xs text-slate-500">+{contact.phone}</span></span>
                  {contact.opened ? <CheckCircle2 className="h-5 w-5 text-[#25D366]" /> : <ExternalLink className="h-4 w-4 text-slate-500" />}
                </button>
              ))}
            </div>
            {contacts.length > 100 && <p className="mt-3 text-xs text-slate-500">Showing the first 100 contacts. Use Open next chat to continue through the complete queue.</p>}
          </section>
        )}
      </div>
    </main>
  );
}
