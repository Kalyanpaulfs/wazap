"use client";
import { useState } from "react";
import Link from "next/link";
import { Copy, Check, MessageCircle, ExternalLink } from "lucide-react";

interface Tmpl { title: string; body: string; }
const CATEGORIES: { name: string; items: Tmpl[] }[] = [
  {
    name: "Sales follow-up",
    items: [
      { title: "Warm intro", body: "Hi {name}, this is {you} from {company}. Thanks for your interest! I'd love to share a few options that fit what you're looking for. When's a good time to chat?" },
      { title: "Follow-up after no reply", body: "Hi {name}, just following up on my earlier message. Are you still looking into this? Happy to answer any questions whenever you're ready." },
      { title: "Special offer", body: "Hi {name}! We have a limited offer this week that I thought you'd like. Would it be okay if I send you the details?" },
    ],
  },
  {
    name: "Customer support",
    items: [
      { title: "Acknowledge request", body: "Hi {name}, thanks for reaching out! I've received your message and I'm looking into it now. I'll get back to you shortly." },
      { title: "Resolution + follow-up", body: "Hi {name}, good news — this is now sorted. Please let me know if everything looks right on your end, and I'm here if you need anything else." },
      { title: "Business hours reply", body: "Thanks for your message! Our team is available {hours}. We'll reply as soon as we're back. For anything urgent, reply URGENT and we'll prioritise it." },
    ],
  },
  {
    name: "Real estate",
    items: [
      { title: "New listing alert", body: "Hi {name}, a new {type} just came up in {area} that matches what you wanted — {beds} bed, {price}. Want me to send photos and arrange a viewing?" },
      { title: "Viewing confirmation", body: "Hi {name}, confirming your viewing at {building} on {date} at {time}. I'll meet you at the entrance. Reply here if anything changes." },
      { title: "Post-viewing follow-up", body: "Hi {name}, thanks for viewing {building} today! What did you think? I have a couple more options in the same area if you'd like to compare." },
    ],
  },
  {
    name: "E-commerce & appointments",
    items: [
      { title: "Order confirmation", body: "Hi {name}, your order #{order} is confirmed! We'll notify you here as soon as it ships. Thanks for shopping with {company} 🙌" },
      { title: "Appointment reminder", body: "Hi {name}, a friendly reminder of your appointment with {company} on {date} at {time}. Reply CONFIRM to keep it or RESCHEDULE to change." },
      { title: "Feedback request", body: "Hi {name}, hope you loved your experience with {company}! If you have 20 seconds, we'd really appreciate a quick review. Thank you 💚" },
    ],
  },
];

export default function TemplatesPage() {
  const [vals, setVals] = useState<Record<string, string>>({ name: "", you: "", company: "" });
  const [copied, setCopied] = useState("");
  const [sendNum, setSendNum] = useState("");

  function fill(body: string) {
    return body.replace(/\{(\w+)\}/g, (_m, k) => (vals[k] && vals[k].trim()) ? vals[k] : `{${k}}`);
  }
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1500);
  }
  const num = sendNum.replace(/\D/g, "");

  return (
    <>
      <div className="border-b border-green-900/20 bg-[#0a0f0a]/90 px-4 h-10 flex items-center gap-3 text-sm">
        <Link href="/tools" className="text-slate-500 hover:text-white">← Tools</Link>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">Message Templates</span>
        <span className="ml-auto text-xs text-slate-500">Free · unlimited</span>
      </div>

      <div className="hero-bg px-4 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">WhatsApp Message Templates</h1>
            <p className="text-slate-400">Ready-to-use message templates for sales, support, real estate and more. Fill in the blanks, copy, and paste into WhatsApp.</p>
          </div>

          {/* Personalise */}
          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
            <div className="text-sm font-medium text-white mb-3">Personalise (optional)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[{ k: "name", ph: "Contact name" }, { k: "you", ph: "Your name" }, { k: "company", ph: "Company" }].map(f => (
                <input key={f.k} value={vals[f.k]} onChange={e => setVals(v => ({ ...v, [f.k]: e.target.value }))} placeholder={f.ph}
                  className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input value={sendNum} onChange={e => setSendNum(e.target.value)} placeholder="Optional: number to open chat (with country code)"
                className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] font-mono" />
            </div>
          </div>

          {CATEGORIES.map(cat => (
            <div key={cat.name}>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">{cat.name}</h2>
              <div className="space-y-3">
                {cat.items.map((t, i) => {
                  const filled = fill(t.body);
                  const key = `${cat.name}-${i}`;
                  const waLink = num.length >= 8 ? `https://wa.me/${num}?text=${encodeURIComponent(filled)}` : "";
                  return (
                    <div key={key} className="rounded-2xl border border-slate-800 bg-[#111811] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-white">{t.title}</span>
                        <div className="flex items-center gap-2">
                          {waLink && (
                            <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#25D366] hover:underline">
                              <MessageCircle className="h-3.5 w-3.5" /> Open <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <button onClick={() => copy(filled, key)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 hover:border-[#25D366] px-3 py-1.5 text-xs text-slate-300 hover:text-white transition-colors">
                            {copied === key ? <Check className="h-3.5 w-3.5 text-[#25D366]" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied === key ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{filled}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <p className="text-center text-xs text-slate-600">Templates are text you copy and send yourself — nothing is sent automatically.</p>
        </div>
      </div>
    </>
  );
}
