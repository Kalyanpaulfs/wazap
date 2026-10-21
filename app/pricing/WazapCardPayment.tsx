"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Loader2, Wallet } from "lucide-react";
import { PLAN_PRICES } from "@/lib/billing";

type CheckoutProvider = "paypal" | "dodo";

export default function WazapCardPayment({
  planName,
  locale,
  country,
  cardCheckoutEnabled,
  subscribePaypalLabel = "Subscribe with PayPal",
  subscribeCardLabel = "Subscribe by card",
}: {
  planName: string;
  locale?: string;
  country?: string;
  cardCheckoutEnabled: boolean;
  subscribePaypalLabel?: string;
  subscribeCardLabel?: string;
}) {
  const [loadingProvider, setLoadingProvider] = useState<CheckoutProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function pay(provider: CheckoutProvider) {
    setLoadingProvider(provider);
    setError(null);
    setNotice(null);
    setManageUrl(null);
    window.gtag?.("event", "begin_checkout", {
      currency: "USD",
      value: PLAN_PRICES[planName as keyof typeof PLAN_PRICES],
      plan: planName,
      payment_provider: provider,
    });
    try {
      const res = await fetch(`/api/payment/${provider}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planName, locale, country }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.manual && data.message) {
        window.gtag?.("event", "checkout_handoff", { plan: planName, payment_provider: "paypal_invoice" });
        setNotice(data.message);
        setLoadingProvider(null);
        return;
      }
      if (!res.ok || !data.url) {
        window.gtag?.("event", "checkout_error", {
          plan: planName,
          payment_provider: provider,
          response_status: res.status,
        });
        if (res.status === 401) { window.location.href = `/login?redirect=${encodeURIComponent(`/pricing?plan=${planName}`)}`; return; }
        if (data.manageUrl === "/billing") setManageUrl(data.manageUrl);
        setError(data.error ?? "Could not start checkout. Please try again.");
        setLoadingProvider(null);
        return;
      }
      window.gtag?.("event", "checkout_handoff", { plan: planName, payment_provider: provider });
      window.location.href = data.url;
    } catch {
      window.gtag?.("event", "checkout_error", { plan: planName, payment_provider: provider, response_status: 0 });
      setError("Network error. Please try again.");
      setLoadingProvider(null);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => pay("paypal")}
        disabled={!!loadingProvider}
        className="flex items-center justify-center gap-2 w-full rounded-full bg-accent hover:bg-accent-hover py-3 text-sm font-semibold text-on-accent shadow-[0_10px_24px_-10px_color-mix(in_srgb,var(--color-accent)_70%,transparent)] transition-all hover:-translate-y-px disabled:opacity-50"
      >
        {loadingProvider === "paypal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {subscribePaypalLabel}
      </button>
      {cardCheckoutEnabled && (
        <button
          onClick={() => pay("dodo")}
          disabled={!!loadingProvider}
          className="flex items-center justify-center gap-2 w-full rounded-full border border-border-strong bg-transparent hover:border-accent py-3 text-sm font-semibold text-text transition-colors disabled:opacity-50"
        >
        {loadingProvider === "dodo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {subscribeCardLabel}
        <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
          Dodo
        </span>
      </button>
      )}
      {manageUrl && <Link href={manageUrl} className="block text-center text-sm font-semibold text-accent">Manage existing subscription →</Link>}
      <p className="text-center text-xs leading-5 text-muted">Monthly renewal. Cancel from your dashboard. Taxes, if applicable, are shown at checkout.</p>
      {error && <p className="mt-2 text-xs text-danger text-center">{error}</p>}
      {notice && <p className="mt-2 text-xs text-accent text-center">{notice}</p>}
    </div>
  );
}
