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
        <p className="text-center text-xs text-slate-400">Continue below to complete checkout.</p>
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
          className="flex w-full items-center justify-center rounded-full bg-[#25D366] hover:bg-[#1fba58] py-3 text-sm font-semibold text-black transition-colors disabled:opacity-50"
        >
          {busy ? "Renewing…" : "Renew"}
        </button>
        {error && <p className="text-center text-xs text-red-400">{error}</p>}
        {notice && <p className="text-center text-xs text-[#25D366]">{notice}</p>}
      </div>
    );
  }

  const confirmText =
    kind === "upgrade"
      ? `You pay the full price of ${planLabel} today. Your new plan starts right away. Remaining days of your current plan are not refunded.`
      : `You keep ${currentPlanLabel} until ${renewsOrExpiresAtLabel || "your renewal date"}. Then ${planLabel} starts and you pay the lower price. Extra rotators/channels above the new limit will be paused.`;

  if (!confirming) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={`flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold transition-colors ${
            kind === "upgrade"
              ? "bg-[#25D366] hover:bg-[#1fba58] text-black"
              : "border border-slate-700 hover:border-[#25D366] text-slate-200"
          }`}
        >
          {kind === "upgrade" ? "Upgrade now" : "Downgrade"}
        </button>
        {error && <p className="text-center text-xs text-red-400">{error}</p>}
        {notice && <p className="text-center text-xs text-[#25D366]">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-black/20 p-3 space-y-3">
      <p className="text-xs leading-5 text-slate-300">{confirmText}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="flex-1 rounded-lg bg-[#25D366] py-2 text-xs font-bold text-black disabled:opacity-50"
        >
          {busy ? "Confirming…" : "Confirm"}
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="px-2 text-xs text-slate-400">
          Cancel
        </button>
      </div>
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
