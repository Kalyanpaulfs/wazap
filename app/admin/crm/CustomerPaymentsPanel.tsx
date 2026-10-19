"use client";

import { useState } from "react";
import { X } from "lucide-react";

type PaymentItem = {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  createdAt: string;
  status: string;
  refundableUntil: string;
  canRefund: boolean;
  refundStatus: string | null;
};

export default function CustomerPaymentsPanel({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payments, setPayments] = useState<PaymentItem[] | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentItem | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/billing/payments?userId=${encodeURIComponent(userId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load payments.");
        setPayments([]);
        return;
      }
      setPayments(data.payments || []);
    } catch {
      setError("Network error. Please try again.");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && payments === null) load();
  }

  function onRefunded(paymentId: string) {
    setPayments((prev) => prev && prev.map((p) => (p.id === paymentId ? { ...p, refundStatus: "succeeded", canRefund: false } : p)));
  }

  return (
    <div>
      <button type="button" onClick={toggle} className="wp-crm-secondary">
        {open ? "Hide payments" : "Payments"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-border bg-bg/50 p-3">
          {loading && <p className="text-xs text-muted">Loading payments…</p>}
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          {payments && payments.length === 0 && !loading && (
            <p className="text-xs text-muted">No PayPal or Dodo payments recorded.</p>
          )}
          {payments && payments.length > 0 && (
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                  <div className="text-xs">
                    <strong className="text-text">
                      {p.provider === "dodo" ? "Dodo" : "PayPal"} · {p.currency} {p.amount.toFixed(2)}
                    </strong>
                    <p className="mt-0.5 text-muted">
                      {new Date(p.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} · {p.status}
                    </p>
                  </div>
                  {p.refundStatus === "succeeded" ? (
                    <span className="text-xs font-semibold text-accent">Refunded</span>
                  ) : p.canRefund ? (
                    <button type="button" className="wp-crm-secondary" onClick={() => setRefundTarget(p)}>
                      Refund
                    </button>
                  ) : (
                    <span className="text-xs text-muted">Refund window closed</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {refundTarget && (
        <RefundModal
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={() => {
            onRefunded(refundTarget.id);
            setRefundTarget(null);
          }}
        />
      )}
    </div>
  );
}

function RefundModal({
  payment,
  onClose,
  onSuccess,
}: {
  payment: PaymentItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/billing/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Refund failed.");
        setBusy(false);
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  const reasonValid = reason.trim().length >= 3 && reason.trim().length <= 300;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-bg/70" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <button onClick={onClose} disabled={busy} aria-label="Close" className="absolute top-3 right-3 text-muted hover:text-text disabled:opacity-40">
          <X className="h-4 w-4" />
        </button>
        <h3 className="pr-6 text-sm font-semibold text-text">
          Refund {payment.currency} {payment.amount.toFixed(2)} to the customer and end their paid plan now?
        </h3>
        <p className="mt-2 text-xs text-muted">
          This refunds through {payment.provider === "dodo" ? "Dodo" : "PayPal"}, cancels the subscription, and ends paid access unless another active subscription covers the customer.
        </p>
        <label className="mt-3 block text-xs text-muted">
          Reason (3–300 characters)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
            className="mt-1 w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-xs text-text"
          />
        </label>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !reasonValid}
            className="rounded-lg bg-danger px-3 py-2 text-xs font-bold text-text disabled:opacity-40"
          >
            {busy ? "Refunding…" : "Confirm refund"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="px-2 text-xs text-muted">
            Cancel
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
