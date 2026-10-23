"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";

const REASONS: { value: string; label: string }[] = [
  { value: "phishing", label: "Phishing or scam" },
  { value: "malware", label: "Malware" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
];

// Rate limited per IP by app/api/short-urls/report/route.ts.
export default function ReportForm({ code }: { code: string }) {
  const [reason, setReason] = useState("phishing");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/short-urls/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, reason, details }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not send the report. Please try again.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="hero-bg min-h-screen px-4 py-16">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-2 text-sm">
          <Link href="/tools/link-shortener" className="text-slate-500 hover:text-white">← Link shortener</Link>
        </div>
        <section className="rounded-3xl border border-slate-800 bg-[#111811] p-7">
          <div className="flex items-center gap-2 text-white">
            <Flag className="h-5 w-5 text-amber-300" />
            <h1 className="text-xl font-bold">Report this link</h1>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Report <span className="break-all font-mono text-slate-300">/s/{code}</span> for phishing, malware, spam or another problem. A link is automatically disabled after 3 reports.
          </p>

          {done ? (
            <p className="mt-5 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-3 text-sm text-[#25D366]">
              Thanks - your report has been recorded.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs text-slate-400" htmlFor="report-reason">Reason</label>
                <select
                  id="report-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white focus:border-[#25D366] focus:outline-none"
                >
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400" htmlFor="report-details">Details (optional)</label>
                <textarea
                  id="report-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-[#25D366] focus:outline-none"
                  placeholder="Anything else we should know?"
                />
              </div>
              {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-[#25D366] py-3 text-sm font-bold text-black transition-colors hover:bg-[#1fba58] disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send report"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
