"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSiteLocale } from "@/app/localization/SiteLocale";

const REASONS = [
  ["too_expensive", "Too expensive"],
  ["missing_features", "Missing features"],
  ["switched_service", "Switching to another service"],
  ["unused", "Not using it enough"],
  ["customer_service", "Support experience"],
  ["too_complex", "Too complex"],
  ["other", "Other"],
] as const;

const PLAN_LABELS: Record<string, string> = { free: "Free", basic: "Solo", pro: "Growth", ultimate: "Agency", business: "Business" };

type PendingPlanChange = { kind: string; toPlan: string; effectiveAt: string | null };

export default function BillingManager({
  method,
  expiresAt,
  billingPlanChangesEnabled = false,
  autoRenew = true,
  pendingChange = null,
}: {
  method: string | null;
  expiresAt: string | null;
  billingPlanChangesEnabled?: boolean;
  autoRenew?: boolean;
  pendingChange?: PendingPlanChange | null;
}) {
  const router = useRouter();
  const { language } = useSiteLocale();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState("");

  async function updateCard() {
    setCardBusy(true);
    setCardError("");
    try {
      const res = await fetch("/api/billing/update-card", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setCardError(data.error || "Could not open the card update page.");
        setCardBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setCardError("Network error. Please try again.");
      setCardBusy(false);
    }
  }

  const updateCardButton = method === "dodo" && (
    <div className="mt-3">
      <button
        type="button"
        onClick={updateCard}
        disabled={cardBusy}
        className="text-xs font-semibold text-[#25D366] hover:underline disabled:opacity-50"
      >
        {cardBusy ? "Opening…" : "Update card →"}
      </button>
      {cardError && <p role="alert" className="mt-1 text-xs text-red-400">{cardError}</p>}
    </div>
  );

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

  async function turnOff() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/billing/autopay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: false, reason, locale: language }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(result.error || "Unable to update billing.");
        setBusy(false);
        return;
      }
      setNotice("Auto-pay turned off. Access continues until your current period ends.");
      setOpen(false);
      setBusy(false);
      router.refresh();
    } catch {
      setNotice("We could not confirm the billing change. Please check again or contact support.");
      setBusy(false);
    }
  }

  async function turnOn() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/billing/autopay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on: true, locale: language }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(data.error || "Unable to update billing.");
        setBusy(false);
        return;
      }
      if (data.checkout) {
        router.push("/plans");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setNotice(data.alreadyOn ? "Auto-pay is already on." : "Auto-pay turned back on.");
      setBusy(false);
      router.refresh();
    } catch {
      setNotice("We could not confirm the billing change. Please check again or contact support.");
      setBusy(false);
    }
  }

  async function cancelScheduledChange() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/billing/change/cancel", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(data.error || "Unable to update billing.");
        setBusy(false);
        return;
      }
      setNotice(data.autoRenewOff
        ? "Change cancelled. Auto-pay is now off: turn it back on to keep your current plan."
        : "Change cancelled. Your current plan continues.");
      setBusy(false);
      router.refresh();
    } catch {
      setNotice("We could not confirm the billing change. Please check again or contact support.");
      setBusy(false);
    }
  }

  if (!billingPlanChangesEnabled) {
    // Today's behaviour, minus the dead Dodo portal link (Dodo's portal is
    // no longer linked anywhere; customers update their card instead).
    if (method === "dodo") return updateCardButton;
    if (method !== "paypal") {
      return (
        <Link href="/support" className="mt-3 inline-flex text-xs font-semibold text-[#25D366] hover:underline">
          Billing support →
        </Link>
      );
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

  // Flag on: full auto-pay + change-plan experience.
  return (
    <div className="mt-3 space-y-3">
      {pendingChange && (
        <p className="rounded-xl border border-[#25D366]/30 bg-[#25D366]/5 px-3 py-2 text-xs leading-5 text-[#25D366]">
          Changes to {PLAN_LABELS[pendingChange.toPlan] || pendingChange.toPlan} on{" "}
          {pendingChange.effectiveAt ? new Date(pendingChange.effectiveAt).toLocaleDateString("en-GB") : "your next billing date"}
          {pendingChange.kind === "downgrade" && (
            <button type="button" onClick={cancelScheduledChange} disabled={busy} className="ml-2 font-semibold text-slate-300 underline hover:text-white disabled:opacity-50">
              Cancel change
            </button>
          )}
        </p>
      )}
      <p className="text-xs text-slate-400">
        Auto-pay: <span className={autoRenew ? "font-semibold text-[#25D366]" : "font-semibold text-slate-300"}>{autoRenew ? "On" : "Off"}</span>
      </p>
      {autoRenew ? (
        !open ? (
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-slate-400 hover:text-white">
            Turn off auto-pay
          </button>
        ) : (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-xs leading-5 text-slate-300">
              Your plan stays active until {expiresAt ? new Date(expiresAt).toLocaleDateString("en-GB") : "the end of your current period"}, then ends.
            </p>
            <select
              aria-label="Cancellation reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
            >
              <option value="">Why are you turning it off?</option>
              {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!reason || busy}
                onClick={turnOff}
                className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                {busy ? "Confirming…" : "Confirm"}
              </button>
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="px-2 text-xs text-slate-400">
                Keep auto-pay on
              </button>
            </div>
          </div>
        )
      ) : (
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#1fba58] disabled:opacity-50"
        >
          {busy ? "Turning on…" : "Renew"}
        </button>
      )}
      {notice && <p role="status" className="text-xs leading-5 text-slate-400">{notice}</p>}
      {updateCardButton}
      <Link href="/plans" className="block text-xs font-semibold text-[#25D366] hover:underline">
        Change plan →
      </Link>
    </div>
  );
}
