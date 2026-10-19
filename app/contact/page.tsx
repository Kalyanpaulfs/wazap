"use client";
import { useEffect, useState } from "react";
import { MessageCircle, Mail, CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const subject = new URLSearchParams(window.location.search).get("subject");
    if (subject === "Business plan" || subject === "business") {
      setForm(current => ({ ...current, subject: "business", message: "I'm interested in the Wazap Business package. Please contact me about my team and routing needs." }));
    }
  }, []);

  function set(k: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send");
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full rounded-xl bg-surface border border-border px-4 py-3 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent/50 transition-colors";
  const labelClass = "block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5";

  if (sent) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-soft border border-accent/30 mb-6">
          <CheckCircle className="h-8 w-8 text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-text mb-2">Message received!</h1>
        <p className="text-muted mb-6">Your request is queued for review. A response will be sent to <strong className="text-text">{form.email}</strong> within 12 hours.</p>
        <Link href="/" className="rounded-full border border-border-strong hover:border-accent/40 px-6 py-2.5 text-sm text-muted hover:text-text transition-colors">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft border border-accent/20 mb-4">
          <Mail className="h-7 w-7 text-accent" />
        </div>
        <h1 className="text-3xl font-bold text-text">Contact Us</h1>
        <p className="text-muted mt-2">Our AI assistant can answer most questions right away in the chat widget. For anything else, send a message here and our team replies within 12 hours.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {[
          { icon: "💬", title: "General Help", desc: "Questions about tools or features" },
          { icon: "💳", title: "Billing", desc: "Payment, plan, or refund queries" },
          { icon: "🔐", title: "Account", desc: "Login, password, or access issues" },
        ].map(c => (
          <div key={c.title} className="rounded-xl border border-border bg-surface p-4 text-center">
            <p className="text-2xl mb-1">{c.icon}</p>
            <p className="text-sm font-semibold text-text">{c.title}</p>
            <p className="text-xs text-muted mt-0.5">{c.desc}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-name" className={labelClass}>Name *</label>
            <input autoComplete="name" id="contact-name" required value={form.name} onChange={set("name")} className={inputClass} placeholder="Your name" />
          </div>
          <div>
            <label htmlFor="contact-email" className={labelClass}>Email *</label>
            <input autoComplete="email" id="contact-email" required type="email" value={form.email} onChange={set("email")} className={inputClass} placeholder="you@example.com" />
          </div>
        </div>

        <div>
          <label htmlFor="contact-subject" className={labelClass}>Subject *</label>
          <select id="contact-subject" required value={form.subject} onChange={set("subject")} className={inputClass}>
            <option value="">Select a topic…</option>
            <option value="general">General question</option>
            <option value="billing">Billing / payment</option>
            <option value="account">Account / login</option>
            <option value="tool">Tool issue</option>
            <option value="feature">Feature request</option>
            <option value="business">Business package</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="contact-message" className={labelClass}>Message *</label>
          <textarea id="contact-message" required value={form.message} onChange={set("message")} rows={5} className={inputClass + " resize-none"}
            placeholder="Describe your question or issue in detail…" />
        </div>

        {error && <p role="alert" className="text-danger text-sm">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full rounded-full bg-accent hover:bg-accent-hover disabled:opacity-50 py-3 text-sm font-semibold text-on-accent transition-colors flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><MessageCircle className="h-4 w-4" /> Send Message</>}
        </button>
      </form>

      <p className="text-center text-xs text-muted mt-4">
        Have a quick question? Check the <Link href="/#faq" className="text-accent hover:underline">FAQ</Link> first.
      </p>
    </div>
  );
}
