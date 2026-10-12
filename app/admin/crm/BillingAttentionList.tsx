"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AttentionItem = { id: string; provider: string; eventType: string; reason: string; chargeId: string | null; email: string | null; customer: string | null; amount: number | null; currency: string | null; createdAt: string };

export default function BillingAttentionList({ items }: { items: AttentionItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function resolve(id: string) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/admin/billing-attention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) setError((await response.json().catch(() => ({}))).error || "Could not update.");
      router.refresh();
    } finally {
      setBusy("");
    }
  }
  if (!items.length) return <div className="wp-growth-callout mt-6"><strong>Payments needing attention</strong><p className="text-xs leading-6 mt-2">Nothing to review. Refunds, chargebacks, disputes and payments Wazap could not match will appear here.</p></div>;
  return <div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
    <strong className="text-amber-200">Payments needing attention ({items.length})</strong>
    <p className="text-xs text-slate-400 mt-1">Check each one in the PayPal or Dodo dashboard, fix the customer if needed, then mark it resolved.</p>
    {error && <p role="alert" className="text-xs text-red-400 mt-2">{error}</p>}
    <div className="wp-growth-table-wrap mt-3"><table className="wp-growth-table"><thead><tr><th>When</th><th>Provider · event</th><th>What happened</th><th>Customer</th><th>Amount</th><th></th></tr></thead><tbody>
      {items.map(item => <tr key={item.id}>
        <td className="text-xs">{new Date(item.createdAt).toLocaleString("en-GB")}</td>
        <td><strong>{item.provider === "dodo" ? "Dodo" : "PayPal"}</strong><p className="text-xs text-slate-400 mt-1">{item.eventType}</p></td>
        <td className="text-xs">{item.reason}{item.chargeId && <details className="mt-1"><summary>Payment reference</summary><p className="break-all">{item.chargeId}</p></details>}</td>
        <td className="text-xs">{item.customer || item.email || "Unknown"}</td>
        <td className="text-xs">{item.amount != null ? `${item.currency || ""} ${item.amount.toFixed(2)}` : "n/a"}</td>
        <td><button className="wp-crm-secondary" disabled={busy === item.id} onClick={() => resolve(item.id)}>{busy === item.id ? "Saving…" : "Mark resolved"}</button></td>
      </tr>)}
    </tbody></table></div>
  </div>;
}
