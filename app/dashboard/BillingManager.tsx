"use client";

import { useState } from "react";
import Link from "next/link";

const REASONS = [
  ["too_expensive", "Too expensive"],
  ["missing_features", "Missing features"],
  ["switched_service", "Switching to another service"],
  ["unused", "Not using it enough"],
  ["customer_service", "Support experience"],
  ["too_complex", "Too complex"],
  ["other", "Other"],
] as const;

export default function BillingManager({
  method,
  expiresAt,
}: {
  method: string | null;
  expiresAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  if (method === "dodo") {
    return (
      <a
        href="https://customer.dodopayments.com"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex text-xs font-semibold text-[#25D366] hover:underline"
      >
        Open secure billing portal →
      </a>
    );
  }

  if (method !== "paypal") {
    return (
      <Link href="/support" className="mt-3 inline-flex text-xs font-semibold text-[#25D366] hover:underline">
        Billing support →
      </Link>
    );
  }

  async function cancel() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const result = await response.json();
      setNotice(result.notice || result.error || "Unable to update billing.");
      if (response.ok) setOpen(false);
    } catch {
      setNotice("We could not confirm the billing change. Please check again or contact support.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-slate-400 hover:text-white">
          Cancel renewal
        </button>
      ) : (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-xs leading-5 text-slate-300">
            This stops future PayPal renewals. Access continues
            {expiresAt ? ` through ${new Date(expiresAt).toLocaleDateString()}` : " through the current paid period"}.
          </p>
          <select
            aria-label="Cancellation reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          >
            <option value="">Why are you cancelling?</option>
            {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!reason || busy}
              onClick={cancel}
              className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              {busy ? "Confirming…" : "Confirm cancellation"}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="px-2 text-xs text-slate-400">
              Keep plan
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status" className="mt-2 text-xs leading-5 text-slate-400">{notice}</p>}
    </div>
  );
}
