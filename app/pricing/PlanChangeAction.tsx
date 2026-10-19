"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WazapCardPayment from "./WazapCardPayment";

type Kind = "upgrade" | "downgrade" | "renew";

export default function PlanChangeAction({
  kind,
  planId,
  planLabel,
  currentPlanLabel,
  renewsOrExpiresAtLabel,
  locale,
  country,
  cardCheckoutEnabled,
  subscribePaypalLabel,
  subscribeCardLabel,
}: {
  kind: Kind;
  planId: string;
  planLabel: string;
  currentPlanLabel: string;
  renewsOrExpiresAtLabel: string | null;
  locale: string;
  country?: string;
  cardCheckoutEnabled: boolean;
  subscribePaypalLabel: string;
  subscribeCardLabel: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint = kind === "renew" ? "/api/billing/autopay" : "/api/billing/change";
      const body = kind === "renew" ? { on: true, locale } : { plan: planId, locale };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not change your plan. Please try again.");
        setBusy(false);
        return;
      }
      if (data.checkout) {
        setShowCheckout(true);
        setBusy(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.applied === "pending_webhook") {
        setNotice("Upgrade in progress…");
        setTimeout(() => {
          router.push(`/dashboard?upgraded=1&provider=dodo&plan=${encodeURIComponent(planId)}`);
        }, 900);
        return;
      }
      if (typeof data.effectiveAt === "string") {
        const date = new Date(data.effectiveAt).toLocaleDateString("en-GB");
        setNotice(`Scheduled: changes to ${planLabel} on ${date}`);
        setBusy(false);
        setConfirming(false);
        router.refresh();
        return;
      }
      if (data.alreadyOn) {
        setNotice("Auto-pay is already on.");
        setBusy(false);
        router.refresh();
        return;
      }
      if (data.applied === "autorenew_enabled") {
        setNotice("Auto-pay turned back on.");
        setBusy(false);
        router.refresh();
        return;
      }
      setNotice("Done.");
      setBusy(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  if (showCheckout) {
    return (
      <div className="space-y-2">
        <p className="text-center text-xs text-muted">Continue below to complete checkout.</p>
        <WazapCardPayment
          planName={planId}
          locale={locale}
          country={country}
          cardCheckoutEnabled={cardCheckoutEnabled}
          subscribePaypalLabel={subscribePaypalLabel}
          subscribeCardLabel={subscribeCardLabel}
        />
      </div>
    );
  }

  if (kind === "renew") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="flex w-full items-center justify-center rounded-full bg-accent hover:bg-accent-hover py-3 text-sm font-semibold text-on-accent transition-colors disabled:opacity-50"
        >
          {busy ? "Renewing…" : "Renew"}
        </button>
        {error && <p className="text-center text-xs text-danger">{error}</p>}
        {notice && <p className="text-center text-xs text-accent">{notice}</p>}
      </div>
    );
  }

  const confirmText =
    kind === "upgrade"
      ? `You pay the full price of ${planLabel} today. Your new plan starts right away. Remaining days of your current plan are not refunded.`
      : `You keep ${currentPlanLabel} until ${renewsOrExpiresAtLabel || "your renewal date"}. Then ${planLabel} starts and you pay the lower price. Extra links above the new limit will be paused.`;

  if (!confirming) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold transition-colors ${
            kind === "upgrade"
              ? "bg-accent hover:bg-accent-hover text-on-accent"
              : "border border-border-strong hover:border-accent text-on-accent"
          }`}
        >
          {kind === "upgrade" ? "Upgrade now" : "Downgrade"}
        </button>
        {error && <p className="text-center text-xs text-danger">{error}</p>}
        {notice && <p className="text-center text-xs text-accent">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-strong bg-bg/20 p-3 space-y-3">
      <p className="text-xs leading-5 text-muted">{confirmText}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="flex-1 rounded-lg bg-accent py-2 text-xs font-bold text-on-accent disabled:opacity-50"
        >
          {busy ? "Confirming…" : "Confirm"}
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="px-2 text-xs text-muted">
          Cancel
        </button>
      </div>
      {error && <p className="text-center text-xs text-danger">{error}</p>}
    </div>
  );
}
